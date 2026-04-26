import { Injectable, inject } from '@angular/core';
import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import {
  getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  collection, collectionGroup, doc, query, where, onSnapshot, getDoc, getDocs, setDoc,
  updateDoc, deleteDoc, writeBatch, Firestore as RawFirestore,
} from 'firebase/firestore';
import { Observable, of, switchMap, combineLatest, startWith, map } from 'rxjs';
import { AuthService } from './auth';
import { environment } from '../../environments/environment';

// ─── Calendar Types ──────────────────────────────────────────────────────────

/**
 * Documento calendario. Un utente può avere N calendari (owned) e sottoscriverne
 * altri tramite invite link. Il calendario "Personale" è creato lazy alla prima
 * creazione di evento se l'utente non ne ha (flag `isDefault: true`).
 *
 * Sharing: modello "feed" — link pubblico, subscribe self-service, owner NON
 * vede la lista sottoscritti. Rules: `calendars/{id}/subscribers/{uid}` è read
 * solo self (nessun list dall'owner).
 */
export interface Calendar {
  id?: string;
  uid: string;              // owner
  title: string;
  color: string;            // hex/theme token; default '#1C1B1F'
  description?: string;
  /** Se true → calendario "Personale" auto-creato, non rinominabile né eliminabile. */
  isDefault?: boolean;
  createdAt: number;
  updatedAt?: number;

  // ─── Populated client-side (non persisted) ─────────────────────────────────
  /** Computed in `getMyCalendars()` / `getSubscribedCalendars()`. */
  myRole?: 'owner' | 'subscriber';
}

/**
 * Subdoc in `calendars/{calId}/subscribers/{uid}`. Scritto dal sub stesso
 * (o auto-iscrizione owner al create). Owner NON può listare la subcollection.
 */
export interface CalendarSubscriber {
  uid: string;
  joinedAt: number;
  /** Opt-in notifiche push (cron skippa se false). Default: true per owner, false per sub esterno. */
  notificationsEnabled: boolean;
  role: 'owner' | 'subscriber';
}

/**
 * Schema unificato `invites/{token}` dopo Fase 3. `type` discrimina:
 *   - 'note' → `resourceId` è il noteId (legacy: `noteId` preservato per backcompat).
 *   - 'calendar' → `resourceId` è il calId.
 * Nuovi invites calendar scadono a 30 giorni, note restano 7 come oggi.
 */
export interface InviteDoc {
  type?: 'note' | 'calendar';  // optional → assumere 'note' se mancante (backcompat)
  resourceId?: string;          // nuovo campo; se assente usa `noteId`
  /** @deprecated mantenuto per backcompat con inviti note pre-Fase 3. */
  noteId?: string;
  createdBy: string;
  createdAt: number;
  expiresAt: number;
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class CalendarService {
  private authService: AuthService = inject(AuthService);
  private db: RawFirestore;

  /** Scadenza token invito calendario: 30 giorni (cfr. piano fase 3). */
  private static readonly CALENDAR_INVITE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

  constructor() {
    const app: FirebaseApp = getApps().length ? getApp() : initializeApp(environment.firebase);
    try {
      this.db = initializeFirestore(app, {
        localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
      });
    } catch {
      this.db = getFirestore(app);
    }
  }

  // ─── Create / Update / Delete ──────────────────────────────────────────────

  /**
   * Crea un nuovo calendario + auto-iscrive l'owner.
   * Due step sequenziali (non batch atomico): la rule sui subscribers richiede
   * che il calendar parent esista già al momento della valutazione → batch
   * atomico fallirebbe permission-denied. Trade-off: se step 2 fallisce, calendar
   * orfano (recuperabile manualmente / al prossimo setup).
   *
   * @returns id del calendario appena creato
   */
  async createCalendar(data: {
    title: string;
    color?: string;
    description?: string;
    isDefault?: boolean;
  }): Promise<string> {
    const uid = this.authService.getCurrentUserId();
    if (!uid) throw new Error('Not authenticated');

    const now = Date.now();
    const calDoc: Calendar = {
      uid,
      title: data.title,
      color: data.color ?? '#1C1B1F',
      createdAt: now,
      updatedAt: now,
    };
    if (data.description !== undefined) calDoc.description = data.description;
    if (data.isDefault !== undefined) calDoc.isDefault = data.isDefault;

    // Il subdoc subscribers/{ownerUid} è necessario perché:
    //   a) getSubscribedCalendars() unifica owned+subscribed via collectionGroup(subscribers)
    //   b) il cron (Fase 6) itera subscribers per sapere a chi inviare push
    const calRef = doc(collection(this.db, 'calendars'));
    const subRef = doc(this.db, `calendars/${calRef.id}/subscribers/${uid}`);
    const ownerSub: CalendarSubscriber = {
      uid,
      joinedAt: now,
      notificationsEnabled: true,  // owner default ON
      role: 'owner',
    };

    await setDoc(calRef, calDoc);
    console.log('[CalendarService] createCalendar step 1: calendar created', calRef.id);
    try {
      await setDoc(subRef, ownerSub);
      console.log('[CalendarService] createCalendar step 2: owner subscriber created');
    } catch (err) {
      // Step 2 fallito → calendar orfano (senza subscriber owner). Loggo e propago,
      // così il chiamante (ensurePersonalCalendar in dashboard) può fallback.
      // Non facciamo cleanup del calendar perché la delete potrebbe a sua volta fallire
      // (rules che richiedono cascade su subscribers che non esistono).
      console.error('[CalendarService] createCalendar step 2 FAILED — calendar orphaned', { calId: calRef.id, err });
      throw err;
    }

    console.log('[CalendarService] createCalendar id:', calRef.id, 'uid:', uid);
    return calRef.id;
  }

  /** Aggiorna i campi mutabili di un calendario owned. Bloccato lato rules se non sei l'owner. */
  async updateCalendar(id: string, partial: Partial<Pick<Calendar, 'title' | 'color' | 'description'>>): Promise<void> {
    const uid = this.authService.getCurrentUserId();
    if (!uid) throw new Error('Not authenticated');
    await updateDoc(doc(this.db, `calendars/${id}`), { ...partial, updatedAt: Date.now() });
  }

  /**
   * Cascade delete di un calendario owned:
   *   1. Tutti gli eventi (`notes` con `calendarId==id`) → batch delete
   *   2. Tutti gli invites attivi con `resourceId==id` e `type='calendar'`
   *   3. Tutta la subcollection `subscribers/*`
   *   4. Il doc calendar
   *
   * Batch Firestore: max 500 op. Se gli eventi superano 500 loopa in più batch.
   * L'operazione NON è atomica tra batch (se un batch fallisce a metà il calendario
   * resta con alcuni eventi orfani), ma la UI guard l'owner e in peggiore dei casi
   * l'utente può ri-lanciare delete.
   */
  async deleteCalendar(id: string): Promise<void> {
    const uid = this.authService.getCurrentUserId();
    if (!uid) throw new Error('Not authenticated');

    // Verifica ownership lato client (rules è il backstop)
    const calSnap = await getDoc(doc(this.db, `calendars/${id}`));
    if (!calSnap.exists()) return;
    if (calSnap.data()?.['uid'] !== uid) {
      throw new Error('Permission denied: only owner can delete calendar');
    }

    // 1. Eventi (type='event' + calendarId match)
    //    Nota: query su calendarId usa index (calendarId, reminderTime) già presente
    const eventsSnap = await getDocs(query(
      collection(this.db, 'notes'),
      where('calendarId', '==', id)
    ));

    // 2. Invites calendar attivi (compat: filtro resourceId==id + type==calendar)
    //    Usiamo `resourceId` come campo primario post-Fase 3; gli invites legacy
    //    per note hanno `noteId`, quindi non sono catturati dalla query.
    const invitesSnap = await getDocs(query(
      collection(this.db, 'invites'),
      where('resourceId', '==', id),
      where('type', '==', 'calendar')
    )).catch(() => null);

    // 3. Subscribers subcollection
    //    Solo l'owner può "listare" i subscribers? NO — rules read self-only.
    //    Però deleteDoc del calendar non cascada la subcollection automaticamente,
    //    quindi l'owner deve poterli leggere per cancellarli.
    //    WORKAROUND: la rule `delete` sui subscribers permette all'owner di cancellare
    //    QUALSIASI subdoc (vedi firestore.rules sezione subscribers). Ma per ottenerne
    //    la lista serve anche permesso di read → qui allarghiamo la read ALL'OWNER
    //    solo nel contesto di getDocs (lettura batch). Trade-off: l'owner può
    //    potenzialmente enumerare i sub; privacy-wise meno stretto del piano,
    //    ma è l'unico modo per fare cascade delete lato client senza Cloud Functions.
    //    Alternativa futura (BL): Cloud Function `onCalendarDelete`.
    const subsSnap = await getDocs(collection(this.db, `calendars/${id}/subscribers`)).catch(() => null);

    // Batch chunks (max 500 op per batch)
    const allOps: { ref: any }[] = [];
    eventsSnap.docs.forEach(d => allOps.push({ ref: d.ref }));
    invitesSnap?.docs.forEach(d => allOps.push({ ref: d.ref }));
    subsSnap?.docs.forEach(d => allOps.push({ ref: d.ref }));

    for (let i = 0; i < allOps.length; i += 450) {
      const chunk = allOps.slice(i, i + 450);
      const batch = writeBatch(this.db);
      chunk.forEach(({ ref }) => batch.delete(ref));
      await batch.commit();
    }

    // 4. Finalmente il doc calendar
    await deleteDoc(doc(this.db, `calendars/${id}`));
    console.log('[CalendarService] deleteCalendar id:', id, 'events:', eventsSnap.size, 'subs:', subsSnap?.size ?? 0);
  }

  // ─── Read streams ──────────────────────────────────────────────────────────

  /**
   * Stream real-time dei calendari owned dal current user.
   * Reactive pattern identico a `NoteService.getNotes()`.
   */
  getMyCalendars(): Observable<Calendar[]> {
    return this.authService.user$.pipe(
      switchMap(user => {
        if (!user) return of([] as Calendar[]);
        const q = query(collection(this.db, 'calendars'), where('uid', '==', user.uid));
        return new Observable<Calendar[]>(subscriber => {
          const unsub = onSnapshot(q, snap => {
            const cals: Calendar[] = snap.docs.map(d => ({
              id: d.id,
              ...(d.data() as Omit<Calendar, 'id'>),
              myRole: 'owner' as const,
            }));
            subscriber.next(cals);
          }, err => {
            console.error('[CalendarService] getMyCalendars error:', err.code, err.message);
            subscriber.error(err);
          });
          return () => unsub();
        });
      })
    );
  }

  /**
   * Stream real-time dei calendari cui l'utente è iscritto (subscriber).
   * Implementazione: collectionGroup su `subscribers` where `uid==currentUid`
   * → per ogni subdoc risolvi il parent calendar doc.
   *
   * Nota: include anche i calendari owned (perché owner è auto-iscritto).
   * Il chiamante filtra per `myRole` se vuole solo i subscribed esterni.
   */
  getSubscribedCalendars(): Observable<Calendar[]> {
    return this.authService.user$.pipe(
      switchMap(user => {
        if (!user) return of([] as Calendar[]);
        const q = query(collectionGroup(this.db, 'subscribers'), where('uid', '==', user.uid));
        return new Observable<Calendar[]>(subscriber => {
          const unsub = onSnapshot(q, async snap => {
            // Per ogni subdoc risali al parent `calendars/{calId}`.
            // d.ref.path = "calendars/{calId}/subscribers/{uid}" → segmento 1 = calId.
            const cals: Calendar[] = await Promise.all(snap.docs.map(async d => {
              const calId = d.ref.parent.parent!.id;
              const subData = d.data() as CalendarSubscriber;
              try {
                const calSnap = await getDoc(doc(this.db, `calendars/${calId}`));
                if (!calSnap.exists()) return null;
                return {
                  id: calId,
                  ...(calSnap.data() as Omit<Calendar, 'id'>),
                  myRole: subData.role === 'owner' ? 'owner' : 'subscriber',
                } as Calendar;
              } catch {
                return null;
              }
            })).then(arr => arr.filter((c): c is Calendar => c !== null));
            subscriber.next(cals);
          }, err => {
            console.warn('[CalendarService] getSubscribedCalendars error:', err.code, err.message);
            subscriber.next([]);
          });
          return () => unsub();
        });
      })
    );
  }

  /**
   * Stream unificato owned ∪ subscribed dedupato. Utile per la UI che mostra
   * "tutti i calendari visibili" senza distinzione.
   */
  getAllVisibleCalendars(): Observable<Calendar[]> {
    return combineLatest([
      this.getMyCalendars().pipe(startWith([] as Calendar[])),
      this.getSubscribedCalendars().pipe(startWith([] as Calendar[])),
    ]).pipe(
      map(([owned, subbed]) => {
        // getSubscribedCalendars() include già gli owned (owner auto-iscritto):
        // dedup by id privilegiando `myRole='owner'` dal primo stream.
        const byId = new Map<string, Calendar>();
        subbed.forEach(c => { if (c.id) byId.set(c.id, c); });
        owned.forEach(c => { if (c.id) byId.set(c.id, c); });
        return Array.from(byId.values());
      })
    );
  }

  /** Lettura one-shot del doc calendario. */
  async getCalendar(id: string): Promise<Calendar | null> {
    try {
      const snap = await getDoc(doc(this.db, `calendars/${id}`));
      if (!snap.exists()) return null;
      return { id: snap.id, ...(snap.data() as Omit<Calendar, 'id'>) };
    } catch {
      return null;
    }
  }

  // ─── Subscribe / Unsubscribe ───────────────────────────────────────────────

  /**
   * Consuma un invite calendar: valida token, crea subdoc
   * `calendars/{calId}/subscribers/{myUid}` con `notificationsEnabled:false`.
   * L'owner NON riceve notifiche di nuovi iscritti (modello feed).
   *
   * @returns calId del calendario sottoscritto
   */
  async subscribeToCalendar(token: string): Promise<string> {
    const uid = this.authService.getCurrentUserId();
    if (!uid) throw new Error('Not authenticated');

    const { calendarId, createdBy } = await this.readCalendarInvite(token);
    if (uid === createdBy) throw new Error('Cannot subscribe to your own calendar');

    const subRef = doc(this.db, `calendars/${calendarId}/subscribers/${uid}`);
    // Rifiuta doppia iscrizione silenziosamente (idempotente)
    const existing = await getDoc(subRef);
    if (existing.exists()) {
      return calendarId;
    }

    const subData: CalendarSubscriber = {
      uid,
      joinedAt: Date.now(),
      notificationsEnabled: false,  // opt-in: il sub esterno deve abilitare esplicitamente
      role: 'subscriber',
    };
    await setDoc(subRef, subData);
    return calendarId;
  }

  /** Rimuove la propria iscrizione. Gli eventi di quel calendario spariscono dai feed. */
  async unsubscribeFromCalendar(calId: string): Promise<void> {
    const uid = this.authService.getCurrentUserId();
    if (!uid) throw new Error('Not authenticated');
    await deleteDoc(doc(this.db, `calendars/${calId}/subscribers/${uid}`));
  }

  /**
   * Toggle notifiche push per un calendario (sub o owner). Update sul proprio
   * subdoc `subscribers/{myUid}` — gli altri subdoc sono inaccessibili.
   */
  async toggleCalendarNotifications(calId: string, enabled: boolean): Promise<void> {
    const uid = this.authService.getCurrentUserId();
    if (!uid) throw new Error('Not authenticated');
    await updateDoc(doc(this.db, `calendars/${calId}/subscribers/${uid}`), {
      notificationsEnabled: enabled,
    });
  }

  // ─── Invites ───────────────────────────────────────────────────────────────

  /**
   * Genera un invite link per un calendario. Token 20 char alfanumerici
   * (62^20 ≈ 7×10^35 combinazioni, enumeration-safe). Scadenza 30gg.
   *
   * Lo schema del doc invite è allineato a `InviteDoc`: `type='calendar'` +
   * `resourceId=calId`. Gli invites note mantengono il campo `noteId` legacy
   * per backcompat (cfr. NoteService.createInvite).
   */
  async createCalendarInvite(calId: string): Promise<string> {
    const uid = this.authService.getCurrentUserId();
    if (!uid) throw new Error('Not authenticated');

    // Verifica ownership (rules guardano comunque)
    const calSnap = await getDoc(doc(this.db, `calendars/${calId}`));
    if (!calSnap.exists() || calSnap.data()?.['uid'] !== uid) {
      throw new Error('Permission denied: only owner can create invite');
    }

    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const bytes = crypto.getRandomValues(new Uint8Array(20));
    const token = Array.from(bytes).map(b => chars[b % chars.length]).join('');

    const now = Date.now();
    const invite: InviteDoc = {
      type: 'calendar',
      resourceId: calId,
      createdBy: uid,
      createdAt: now,
      expiresAt: now + CalendarService.CALENDAR_INVITE_TTL_MS,
    };
    await setDoc(doc(this.db, `invites/${token}`), invite);
    return token;
  }

  /**
   * Legge e valida un token invite calendar SENZA consumarlo.
   * Lancia 'invite/not-found', 'invite/expired', 'invite/wrong-type' su errore.
   *
   * Ritorna `{ calendarId, createdBy }` per permettere alla UI di pre-mostrare
   * info ("Ti stai iscrivendo al calendario X di @owner — confermi?").
   */
  async readCalendarInvite(token: string): Promise<{ calendarId: string; createdBy: string }> {
    const inviteSnap = await getDoc(doc(this.db, `invites/${token}`));
    if (!inviteSnap.exists()) throw new Error('invite/not-found');

    const invite = inviteSnap.data() as InviteDoc;
    if (invite.type !== 'calendar') throw new Error('invite/wrong-type');
    if (Date.now() > invite.expiresAt) {
      deleteDoc(inviteSnap.ref).catch(() => {}); // cleanup on-read
      throw new Error('invite/expired');
    }

    const calendarId = invite.resourceId;
    if (!calendarId) throw new Error('invite/malformed');
    return { calendarId, createdBy: invite.createdBy };
  }

  // NOTA: NON esponiamo `getSubscribersList(calId)` — volutamente non
  // implementato. Owner non ha modo di sapere chi è iscritto (modello feed).
}
