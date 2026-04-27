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
  /** Denormalizzato per preview pre-subscribe (l'utente non ha ancora read-access al calendar). */
  calendarTitle?: string;
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

    console.log('[DBG-DEL-CAL] step 0: ownership check', { id, uid });
    let calSnap;
    try {
      calSnap = await getDoc(doc(this.db, `calendars/${id}`));
    } catch (err: any) {
      // Firestore può ritornare permission-denied invece di not-found per
      // non leakare l'esistenza del doc. Caso tipico: cache locale ha un
      // calendar che server-side è stato già eliminato (ghost).
      if (err?.code === 'permission-denied') {
        console.log('[DBG-DEL-CAL] step 0: calendar inaccessibile (deleted o non-owner) — abort graceful');
        return;
      }
      throw err;
    }
    if (!calSnap.exists()) { console.log('[DBG-DEL-CAL] calendar not found, abort'); return; }
    if (calSnap.data()?.['uid'] !== uid) {
      throw new Error('Permission denied: only owner can delete calendar');
    }

    console.log('[DBG-DEL-CAL] step 1: query events (calendarId==id, uid==self)');
    let eventsSnap: any;
    try {
      // Aggiungiamo where('uid','==',uid) perché la rule `notes.read` controlla
      // `resource.data.uid == auth.uid` (doc-dependent): Firestore richiede un
      // constraint nella query che renda la rule staticamente true sull'intera
      // result set. Senza questo where, list/getDocs sull'intera collection notes
      // viene rifiutata permission-denied (Fase 4 deleteCalendar bug).
      eventsSnap = await getDocs(query(
        collection(this.db, 'notes'),
        where('calendarId', '==', id),
        where('uid', '==', uid)
      ));
      console.log('[DBG-DEL-CAL] step 1 OK', { count: eventsSnap.size });
    } catch (err: any) {
      console.error('[DBG-DEL-CAL] step 1 FAILED (events query)', err?.code, err?.message);
      throw err;
    }

    console.log('[DBG-DEL-CAL] step 2: query invites (resourceId==id, type=calendar)');
    let invitesSnap: any = null;
    try {
      invitesSnap = await getDocs(query(
        collection(this.db, 'invites'),
        where('resourceId', '==', id),
        where('type', '==', 'calendar')
      ));
      console.log('[DBG-DEL-CAL] step 2 OK', { count: invitesSnap?.size });
    } catch (err: any) {
      console.warn('[DBG-DEL-CAL] step 2 FAILED (invites query) — non-blocking', err?.code, err?.message);
    }

    console.log('[DBG-DEL-CAL] step 3: list subscribers');
    let subsSnap: any = null;
    try {
      subsSnap = await getDocs(collection(this.db, `calendars/${id}/subscribers`));
      console.log('[DBG-DEL-CAL] step 3 OK', { count: subsSnap?.size });
    } catch (err: any) {
      console.error('[DBG-DEL-CAL] step 3 FAILED (subscribers list)', err?.code, err?.message);
      throw err;
    }

    console.log('[DBG-DEL-CAL] step 4: batch delete', {
      events: eventsSnap.size, invites: invitesSnap?.size ?? 0, subs: subsSnap?.size ?? 0,
    });
    const allOps: { ref: any; type: string }[] = [];
    eventsSnap.docs.forEach((d: any) => allOps.push({ ref: d.ref, type: 'event' }));
    invitesSnap?.docs.forEach((d: any) => allOps.push({ ref: d.ref, type: 'invite' }));
    subsSnap?.docs.forEach((d: any) => allOps.push({ ref: d.ref, type: 'sub' }));

    for (let i = 0; i < allOps.length; i += 450) {
      const chunk = allOps.slice(i, i + 450);
      console.log('[DBG-DEL-CAL] step 4 batch', { i, size: chunk.length, types: chunk.map(c => c.type) });
      try {
        const batch = writeBatch(this.db);
        chunk.forEach(({ ref }) => batch.delete(ref));
        await batch.commit();
        console.log('[DBG-DEL-CAL] step 4 batch OK');
      } catch (err: any) {
        console.error('[DBG-DEL-CAL] step 4 batch FAILED', err?.code, err?.message, { types: chunk.map(c => c.type) });
        throw err;
      }
    }

    console.log('[DBG-DEL-CAL] step 5: delete calendar doc');
    try {
      await deleteDoc(doc(this.db, `calendars/${id}`));
      console.log('[DBG-DEL-CAL] step 5 OK — deleteCalendar complete', { id, events: eventsSnap.size, subs: subsSnap?.size ?? 0 });
    } catch (err: any) {
      console.error('[DBG-DEL-CAL] step 5 FAILED (calendar doc delete)', err?.code, err?.message);
      throw err;
    }
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
   *
   * Implementazione: collectionGroup su `subscribers` where `uid==currentUid`
   * → per ogni calendar subscribed mantiene un listener `onSnapshot` attivo
   * sul doc parent `calendars/{calId}`, in modo che aggiornamenti di color/title
   * da parte dell'owner si propaghino in tempo reale ai subscriber.
   *
   * Nota: include anche i calendari owned (perché owner è auto-iscritto).
   * Il chiamante filtra per `myRole` se vuole solo i subscribed esterni.
   *
   * Performance: con N calendar subscribed, vengono mantenuti N listener Firestore
   * attivi in parallelo. Accettabile per N ≤ 10 (uso tipico). Cleanup automatico
   * alla disiscrizione o quando il subscriber doc viene rimosso.
   */
  getSubscribedCalendars(): Observable<Calendar[]> {
    return this.authService.user$.pipe(
      switchMap(user => {
        if (!user) return of([] as Calendar[]);
        const q = query(collectionGroup(this.db, 'subscribers'), where('uid', '==', user.uid));
        return new Observable<Calendar[]>(subscriber => {
          const cache = new Map<string, Calendar>();              // calId → Calendar live
          const calUnsubs = new Map<string, () => void>();        // calId → unsubscriber
          const subData = new Map<string, CalendarSubscriber>(); // calId → sub metadata
          let invocationId = 0;

          const emit = () => {
            // Nuova reference array ad ogni emissione → Angular CD rileva il cambio
            subscriber.next([...cache.values()]);
          };

          const subUnsub = onSnapshot(q, snap => {
            const myId = ++invocationId;
            const newCalIds = new Set<string>();

            snap.docs.forEach(d => {
              const calId = d.ref.parent.parent!.id;
              const data = d.data() as CalendarSubscriber;
              newCalIds.add(calId);
              subData.set(calId, data);

              // Crea listener live sul calendar parent solo la prima volta
              if (!calUnsubs.has(calId)) {
                const calRef = doc(this.db, `calendars/${calId}`);
                const unsub = onSnapshot(calRef, calSnap => {
                  if (calSnap.exists()) {
                    const sub = subData.get(calId);
                    cache.set(calId, {
                      id: calId,
                      ...(calSnap.data() as Omit<Calendar, 'id'>),
                      myRole: sub?.role === 'owner' ? 'owner' : 'subscriber',
                    });
                  } else {
                    cache.delete(calId);
                  }
                  emit();
                }, err => {
                  console.warn('[CalendarService] subscribed calendar listener error', calId, err.code);
                  cache.delete(calId);
                  emit();
                });
                calUnsubs.set(calId, unsub);
              }
            });

            // Cleanup listener per calendar a cui non si è più iscritti
            for (const [calId, unsub] of [...calUnsubs.entries()]) {
              if (!newCalIds.has(calId)) {
                unsub();
                calUnsubs.delete(calId);
                cache.delete(calId);
                subData.delete(calId);
              }
            }
            if (myId !== invocationId) return; // anti-race: emit più recente già in volo
            emit();
          }, err => {
            console.warn('[CalendarService] getSubscribedCalendars error:', err.code, err.message);
            subscriber.next([]);
          });

          return () => {
            subUnsub();
            calUnsubs.forEach(u => u());
            calUnsubs.clear();
            cache.clear();
            subData.clear();
          };
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

    console.log('[DBG-SUB-CAL] start', { uid, token });

    const { calendarId, createdBy } = await this.readCalendarInvite(token);
    console.log('[DBG-SUB-CAL] invite read', { calendarId, createdBy });

    if (uid === createdBy) throw new Error('Cannot subscribe to your own calendar');

    const subRef = doc(this.db, `calendars/${calendarId}/subscribers/${uid}`);
    // Rifiuta doppia iscrizione silenziosamente (idempotente)
    const existing = await getDoc(subRef);
    console.log('[DBG-SUB-CAL] existing.exists()=', existing.exists(), 'fromCache=', existing.metadata.fromCache);
    if (existing.exists()) {
      console.log('[DBG-SUB-CAL] already subscribed — early return');
      return calendarId;
    }

    const subData: CalendarSubscriber = {
      uid,
      joinedAt: Date.now(),
      notificationsEnabled: false,  // opt-in: il sub esterno deve abilitare esplicitamente
      role: 'subscriber',
    };
    console.log('[DBG-SUB-CAL] setDoc payload', subData, 'path=', subRef.path);
    try {
      await setDoc(subRef, subData);
      console.log('[DBG-SUB-CAL] setDoc resolved');
    } catch (e: any) {
      console.error('[DBG-SUB-CAL] setDoc FAILED', e?.code, e?.message);
      throw e;
    }

    // Verifica persistenza forzando un re-read dal server (no-cache).
    // Se il rule ha rejectato silenziosamente, qui vedremo il rollback.
    try {
      const verify = await getDoc(subRef);
      console.log('[DBG-SUB-CAL] verify after setDoc — exists=', verify.exists(), 'fromCache=', verify.metadata.fromCache, 'data=', verify.data());
    } catch (e: any) {
      console.error('[DBG-SUB-CAL] verify read FAILED', e?.code, e?.message);
    }

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

    // Token formato unambiguous-base32: 8 char UPPERCASE senza 0/O/1/I/L.
    // Stesso pattern di NoteService.createInvite (note share-by-code) — la rule
    // Firestore `invites.create` richiede `inviteId.matches('^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$')`,
    // un token alfanumerico misto rifiutato con permission-denied.
    // 8 char × log2(32) = 40 bit di entropia (lookup space ~1×10^12).
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';   // 32 char
    const bytes = crypto.getRandomValues(new Uint8Array(8));
    const token = Array.from(bytes).map(b => chars[b % chars.length]).join('');

    const calData = calSnap.data();
    const now = Date.now();
    const invite: InviteDoc = {
      type: 'calendar',
      resourceId: calId,
      createdBy: uid,
      createdAt: now,
      expiresAt: now + CalendarService.CALENDAR_INVITE_TTL_MS,
      // Denormalizziamo il title per permettere preview prima del subscribe (quando
      // l'utente non ha ancora rule read sul calendar parent).
      calendarTitle: calData?.['title'] ?? '',
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
