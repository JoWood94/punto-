import { Injectable, inject } from '@angular/core';
import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  collection, collectionGroup, doc, addDoc, updateDoc, deleteDoc, deleteField, query, where, onSnapshot, getDoc, getDocFromServer, setDoc, writeBatch, arrayUnion, arrayRemove, getDocs, serverTimestamp, Firestore as RawFirestore,
  DocumentReference, DocumentSnapshot
} from 'firebase/firestore';
import { Observable, of, switchMap, combineLatest, startWith, map } from 'rxjs';
import { AuthService } from './auth';
import { CryptoService, AES_MARKER } from './crypto';
import { environment } from '../../environments/environment';

// ─── Share Code ───────────────────────────────────────────────────────────────

const SHARE_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const SHARE_CODE_LOOKUP_LEN = 8;
// base64url: 43 chars covers 256 bits
const SHARE_CODE_KEY_REGEX = /^[A-Za-z0-9_-]{43}$/;
const SHARE_CODE_REGEX = new RegExp(
  `^[${SHARE_CODE_ALPHABET}]{${SHARE_CODE_LOOKUP_LEN}}-[A-Za-z0-9_-]{43}$`
);

class ShareCode {
  constructor(
    public readonly lookup: string,
    public readonly key: string
  ) {}

  format(): string {
    return `${this.lookup}-${this.key}`;
  }

  static parse(raw: string): ShareCode | null {
    const normalized = raw.trim().toUpperCase();
    const dashIdx = normalized.indexOf('-');
    if (dashIdx === -1) return null;
    const lookup = normalized.slice(0, dashIdx);
    // Key is case-sensitive base64url — restore original casing from raw
    const rawDashIdx = raw.indexOf('-');
    const key = raw.slice(rawDashIdx + 1).trim();
    const fullCode = `${lookup}-${key}`;
    if (!SHARE_CODE_REGEX.test(fullCode)) return null;
    return new ShareCode(lookup, key);
  }
}

// ─── Block Types ─────────────────────────────────────────────────────────────

export interface TextBlock {
  type: 'text';
  html: string;
}

export interface ChecklistBlock {
  type: 'checklist';
  items: { text: string; done: boolean }[];
}

export interface LocationBlock {
  type: 'location';
  address: string;
  lat?: number;
  lon?: number;
}

export interface ReminderBlock {
  type: 'reminder';
  time: number | null;
  recurrence: 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';
  recurrenceEndDate?: number | null;
  status: 'pending' | 'sent' | 'completed' | null;
  completedAt?: number;   // FE-01: timestamp completamento (opzionale B)
  completedBy?: string;   // FE-01: uid di chi ha completato
}

export interface ImageBlock {
  type: 'image';
  /** Base64 data URL completo (es. "data:image/jpeg;base64,..."). */
  data: string;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  caption?: string;
}

export interface LinkBlock {
  type: 'link';
  url: string;
  label?: string; // testo visualizzato; se assente si mostra l'URL
}

export type NoteBlock = TextBlock | ChecklistBlock | LocationBlock | ReminderBlock | ImageBlock | LinkBlock;

// ─── Note Type ────────────────────────────────────────────────────────────────

/** Discriminator esclusivo del documento. Immutabile dopo la creazione. */
export type NoteType = 'note' | 'memo' | 'event';

// ─── Sharing Types ────────────────────────────────────────────────────────────

export interface CollaboratorPermissions {
  editContent: boolean;
  editReminders: boolean;
}

export interface Collaborator {
  uid: string;
  role: 'guest';
  addedAt: number;
  addedBy: string;
  permissions: CollaboratorPermissions;
  // Opt-in esplicito alle notifiche push per questo doc (pattern A, Fase 1).
  // Impostato al primo accept invito su memo/event. Il cron skippa chi ha false.
  // Assente su note legacy = equivale a true (fallback permissivo).
  notificationsEnabled?: boolean;
}

export interface PresenceEntry {
  uid: string;
  displayName: string;   // username o primo carattere dell'uid
  lastSeen: number;      // Date.now() ms
  isEditing: boolean;
  lastActivityAt?: number; // Date.now() ms — aggiornato su qualsiasi mutazione (checklist, colore, reminder…)
}

// ─── Note Interface ───────────────────────────────────────────────────────────

export interface Note {
  id?: string;
  uid: string;
  title: string;
  blocks: NoteBlock[];

  // ─── Tipizzazione documento (Fase 0) ────────────────────────────────────────
  /** Discriminator esclusivo. Immutabile post-creazione. Default graceful 'note' per doc legacy. */
  type: NoteType;
  /** Solo per type='event'. Setta a true con l'azione "Annulla evento" — l'evento resta visibile ma stilizzato. */
  cancelled?: boolean;
  /** Solo per type='event'. Obbligatorio. Indica il calendario di appartenenza. */
  calendarId?: string;
  /** Immagine di copertina inline base64. Distinto da ImageBlock nei blocks (legacy).
   *  Se entrambi presenti, top-level vince nella UI (semantica "locandina"). */
  image?: {
    data: string;
    mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  };
  /** Denormalizzato. Calcolato da `blocks.some(b => b.type === 'reminder')` ad ogni write.
   *  Usato da Firestore rules e cron per filtrare senza leggere il campo `blocks`. */
  hasReminderBlock?: boolean;

  // ─── Campi generici ─────────────────────────────────────────────────────────
  pinned?: boolean;
  tags?: string[];
  color: string;
  createdAt: number;
  updatedAt?: number;
  reminderRepeat?: 'daily' | 'weekly' | 'monthly' | 'yearly';

  // ─── Legacy flat fields — kept for server backward compatibility ─────────────
  /** @deprecated RF-01b write-off. Field preserved for migrateToBlocks and getNotePreview legacy fallback. Never write on new documents. */
  content?: string;
  reminderTime?: number | null;
  reminderStatus?: 'pending' | 'sent' | 'completed' | null;
  /** @deprecated RF-01b write-off. No active consumers in frontend, server or rules. */
  lastCompletedAt?: number;
  recurrence?: 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';
  recurrenceEndDate?: number | null;

  // ─── Sharing (Fase 2) ────────────────────────────────────────────────────────
  collaboratorUids?: string[];
  isShared?: boolean;                        // computed: collaboratorUids?.length > 0
  myRole?: 'owner' | 'guest';               // set in getNotes()
  myPermissions?: CollaboratorPermissions;   // set in getNotes() for guests
}

// ─── Reminder helpers ─────────────────────────────────────────────────────────
// Post-RF-01b: il reminder vive in blocks[] come ReminderBlock.
// I flat field (reminderTime, reminderStatus, recurrence) sono @deprecated ma
// restano come fallback per note legacy (pre-RF-01b).

function findReminderBlock(n: any): any {
  return Array.isArray(n.blocks) ? (n.blocks.find((b: any) => b.type === 'reminder') ?? null) : null;
}

export function getReminderTime(n: Note | any): number | null {
  return findReminderBlock(n)?.time ?? n.reminderTime ?? null;
}

export function getReminderStatus(n: Note | any): string | null {
  return findReminderBlock(n)?.status ?? n.reminderStatus ?? null;
}

export function getNoteRecurrence(n: Note | any): string {
  return findReminderBlock(n)?.recurrence ?? n.recurrence ?? 'none';
}

export function getRecurrenceEndDate(n: Note | any): number | null {
  return findReminderBlock(n)?.recurrenceEndDate ?? n.recurrenceEndDate ?? null;
}

export function hasReminder(n: Note | any): boolean {
  return getReminderTime(n) !== null;
}

export function isRecurringNote(n: Note | any): boolean {
  return getNoteRecurrence(n) !== 'none';
}

// ─── NoteType guards (Fase 0) ─────────────────────────────────────────────────
// Usano il campo `type` con fallback graceful a 'note' per doc legacy pre-migrazione.

export function isNoteType(n: Note | any): boolean {
  return (n.type ?? 'note') === 'note';
}

export function isMemoType(n: Note | any): boolean {
  return (n.type ?? 'note') === 'memo';
}

export function isEventType(n: Note | any): boolean {
  return (n.type ?? 'note') === 'event';
}

// ─── Utilities ────────────────────────────────────────────────────────────────

/** Converts legacy flat-field note to the block model. Idempotent. */
export function migrateToBlocks(note: any): NoteBlock[] {
  // Array.isArray gestisce anche blocks:[] (nota nuova salvata senza blocchi) —
  // evita che venga trattata come nota legacy e riceva un blocco testo vuoto.
  if (Array.isArray(note.blocks)) return note.blocks as NoteBlock[];
  const blocks: NoteBlock[] = [{ type: 'text', html: note.content || '' }];
  if (note.checklist?.length) {
    blocks.push({ type: 'checklist', items: note.checklist });
  }
  if (note.address) {
    blocks.push({ type: 'location', address: note.address, lat: note.lat ?? undefined, lon: note.lon ?? undefined });
  }
  if (note.reminderTime) {
    blocks.push({
      type: 'reminder',
      time: note.reminderTime,
      recurrence: note.recurrence ?? 'none',
      status: note.reminderStatus ?? null
    });
  }
  return blocks;
}

/** Returns plain-text preview from the first text block (HTML tags stripped). */
export function getNotePreview(note: Note): string {
  const textBlock = note.blocks?.find(b => b.type === 'text') as TextBlock | undefined;
  const html = textBlock?.html ?? note.content ?? '';
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Returns checklist progress { done, total } or null if no checklist block. */
export function getChecklistProgress(note: Note): { done: number; total: number } | null {
  const cl = note.blocks?.find(b => b.type === 'checklist') as ChecklistBlock | undefined;
  if (!cl || cl.items.length === 0) return null;
  return { done: cl.items.filter(i => i.done).length, total: cl.items.length };
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class NoteService {
  private authService: AuthService = inject(AuthService);
  private cryptoService: CryptoService = inject(CryptoService);
  private db: RawFirestore;

  notifTitleEnabled = false;

  // In-memory AES key cache: noteId -> CryptoKey. Cleared on logout.
  private _aesKeyCache = new Map<string, CryptoKey>();

  setNotifTitleEnabled(val: boolean) { this.notifTitleEnabled = val; }

  clearAESKeyCache(): void {
    this._aesKeyCache.clear();
  }

  /**
   * Calcola se almeno un blocco nel documento è di tipo ReminderBlock.
   * Centralizzato per garantire coerenza tra createNote e updateNote.
   * Non esposto pubblicamente: i consumer usano `hasReminder()` o `isMemoType()`.
   */
  private deriveHasReminderBlock(blocks: NoteBlock[]): boolean {
    return blocks.some(b => b.type === 'reminder');
  }

  constructor() {
    const app: FirebaseApp = getApps().length ? getApp() : initializeApp(environment.firebase);
    getAuth(app);
    try {
      this.db = initializeFirestore(app, {
        localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
      });
    } catch (e) {
      this.db = getFirestore(app);
    }
  }

  async createNote(noteData: Partial<Note>): Promise<any> {
    const uid = this.authService.getCurrentUserId();
    if (!uid) throw new Error('Not authenticated');

    // ── Fase 0: tipo + validazione schema ────────────────────────────────────
    // Default-type smart: se l'utente non specifica `type`, deriva da segnali
    // (ReminderBlock nei blocks o `reminderTime` top-level). Preserva il
    // comportamento pre-Fase 0 dove "nota + reminder" equivale a un promemoria.
    let noteType: NoteType;
    if (noteData.type !== undefined) {
      noteType = noteData.type;
    } else {
      const inputBlocks: NoteBlock[] = (noteData.blocks ?? []) as NoteBlock[];
      const hasReminderInInput = inputBlocks.some(b => b.type === 'reminder');
      const hasReminderFlat = !!noteData.reminderTime;
      noteType = (hasReminderInInput || hasReminderFlat) ? 'memo' : 'note';
    }

    if (noteType === 'event' && !noteData.calendarId) {
      throw new Error('createNote: calendarId è obbligatorio per type="event"');
    }

    // Note pure non possono contenere ReminderBlock (li strip silenziosamente)
    let blocks: NoteBlock[] = (noteData.blocks ?? []) as NoteBlock[];
    if (noteType === 'note') {
      blocks = blocks.filter(b => b.type !== 'reminder');
    }

    const hasReminderBlock = this.deriveHasReminderBlock(blocks);
    // ─────────────────────────────────────────────────────────────────────────

    const notesRef = collection(this.db, 'notes');
    const skipFields: (keyof Note)[] = this.notifTitleEnabled ? ['title'] : [];
    const hasCollaborators = (noteData.collaboratorUids?.length ?? 0) > 0;
    const base = {
      collaboratorUids: [] as string[],
      ...noteData,
      type: noteType,
      blocks,
      hasReminderBlock,
      uid,
      createdAt: Date.now(),
    };

    let payload: any;
    if (!this.cryptoService.isEnabled) {
      payload = base;
    } else if (hasCollaborators) {
      // Per note gia condivise alla creazione (caso raro), cifra con AES se disponibile
      const noteId = (noteData as any).id as string | undefined;
      const aesKey = noteId ? this._aesKeyCache.get(noteId) : undefined;
      payload = aesKey
        ? await this.cryptoService.encryptNoteWithAESKey(base, aesKey, skipFields)
        : base; // fallback plaintext (migrazione lazy)
    } else {
      payload = await this.cryptoService.encryptNote(base, skipFields);
    }

    const result = await addDoc(notesRef, payload);
    return result;
  }

  getNotes(): Observable<Note[]> {
    return this.authService.user$.pipe(
      switchMap(user => {
        if (!user) {
          console.log('[NoteService] No user, returning empty');
          return of([]);
        }
        console.log('[NoteService] Fetching notes for uid:', user.uid);
        const notesRef = collection(this.db, 'notes');

        // ── Stream 1: note owned by the current user ──────────────────────────
        const owned$ = new Observable<Note[]>(subscriber => {
          const q = query(notesRef, where('uid', '==', user.uid));
          const unsub = onSnapshot(q, async snapshot => {
            const raws = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as any));
            const notes: Note[] = await Promise.all(raws.map(async raw => {
              // Una nota owned può essere cifrata con AES se l'owner ha generato
              // un share code (generateShareCode migra PGP→AES). Bisogna tentare
              // AES prima di PGP: decryptNote salta i campi AES1: (non PGP),
              // lasciando blocks come stringa → migrateToBlocks → ImageBlock persi.
              const hasAESEncryption =
                (typeof raw.title === 'string' && raw.title.startsWith(AES_MARKER)) ||
                (typeof raw.blocks === 'string' && raw.blocks.startsWith(AES_MARKER));

              let decrypted: any = raw;
              if (hasAESEncryption) {
                const aesKey = await this._getAESKeyForNote(raw.id, user.uid);
                if (aesKey) {
                  try {
                    decrypted = await this.cryptoService.decryptNoteWithAESKey(raw, aesKey);
                  } catch {
                    // chiave non disponibile o corrotta — prosegue con il raw
                  }
                } else {
                  // Cache miss sulla nota owned: snapshot arrivato prima che sharedKeys/{uid}
                  // fosse scritto (race durante generateShareCode). Il prossimo snapshot
                  // recupererà. I guard sotto evitano di esporre il ciphertext raw nell'UI.
                  console.warn('[crypto] cache miss for owned note during emit — noteId:', raw.id,
                    '— next snapshot should recover');
                }
              } else if (this.cryptoService.isEnabled) {
                decrypted = await this.cryptoService.decryptNote(raw);
              }

              // Guard difensiva: se decrypt è fallito transitoriamente (cache miss su
              // sharedKeys, PGP non ancora sbloccata, ecc.) alcuni campi possono essere
              // ancora ciphertext. Non mostrare MAI raw ciphertext nell'UI — emetti
              // stringa vuota / [] e attendi il prossimo snapshot per recuperare.
              const PGP_PREFIX = '-----BEGIN PGP MESSAGE-----';
              const isCipher = (v: unknown) =>
                typeof v === 'string' && (v.startsWith(AES_MARKER) || v.startsWith(PGP_PREFIX));

              if (isCipher(decrypted.title))   { (decrypted as any).title = ''; }
              if (isCipher(decrypted.content)) { (decrypted as any).content = ''; }

              if (!Array.isArray(decrypted.blocks) || (decrypted.blocks as any[]).length === 0) {
                if (isCipher((decrypted as any).blocks)) {
                  (decrypted as any).blocks = [];
                } else {
                  (decrypted as any).blocks = migrateToBlocks(decrypted);
                }
              }
              const blocksArr = decrypted.blocks as NoteBlock[];
              return {
                ...decrypted,
                // Graceful default per doc legacy pre-migrazione Fase 0 (senza campo `type`).
                type: (decrypted.type
                  ?? ((decrypted.reminderTime || blocksArr?.some((b: any) => b?.type === 'reminder'))
                        ? 'memo'
                        : 'note')) as NoteType,
                myRole: 'owner' as const,
                isShared: (decrypted.collaboratorUids?.length ?? 0) > 0,
              } as Note;
            }));
            console.log('[NoteService] Owned notes:', notes.length, 'fromCache:', snapshot.metadata.fromCache);
            subscriber.next(notes);
          }, err => {
            console.error('[NoteService] Owned query error:', err.code, err.message);
            subscriber.error(err);
          });
          return () => unsub();
        });

        // ── Stream 2: note condivise con il current user ──────────────────────
        // Requires Firestore composite index: collaboratorUids ARRAY_CONTAINS + updatedAt DESC
        const shared$ = new Observable<Note[]>(subscriber => {
          const q = query(notesRef, where('collaboratorUids', 'array-contains', user.uid));
          const unsub = onSnapshot(q, async snapshot => {
            const notes: Note[] = await Promise.all(snapshot.docs.map(async d => {
              const raw = { id: d.id, ...d.data() } as any;

              // Tenta decrypt AES se la nota ha campi cifrati con AES1:
              const hasAESEncryption =
                (typeof raw.title === 'string' && raw.title.startsWith(AES_MARKER)) ||
                (typeof raw.blocks === 'string' && raw.blocks.startsWith(AES_MARKER));

              let decrypted = raw;
              if (hasAESEncryption) {
                const aesKey = await this._getAESKeyForNote(d.id, user.uid);
                if (aesKey) {
                  try {
                    decrypted = await this.cryptoService.decryptNoteWithAESKey(raw, aesKey);
                  } catch {
                    // chiave non disponibile o corrotta — mostra cifrato
                  }
                }
              }

              const PGP_PREFIX_SH = '-----BEGIN PGP MESSAGE-----';
              const isCipherSh = (v: unknown) =>
                typeof v === 'string' && (v.startsWith(AES_MARKER) || v.startsWith(PGP_PREFIX_SH));

              if (isCipherSh(decrypted.title))   { (decrypted as any).title = ''; }
              if (isCipherSh(decrypted.content)) { (decrypted as any).content = ''; }

              if (!Array.isArray(decrypted.blocks) || (decrypted.blocks as any[]).length === 0) {
                if (isCipherSh((decrypted as any).blocks)) {
                  (decrypted as any).blocks = [];
                } else {
                  (decrypted as any).blocks = migrateToBlocks(decrypted);
                }
              }

              // Leggi permessi dalla subcollection collaborators
              let permissions: CollaboratorPermissions = { editContent: false, editReminders: false };
              try {
                const collabSnap = await getDoc(doc(this.db, `notes/${d.id}/collaborators/${user.uid}`));
                if (collabSnap.exists()) {
                  permissions = collabSnap.data()?.['permissions'] ?? permissions;
                }
              } catch { /* offline */ }
              return {
                ...decrypted,
                myRole: 'guest' as const,
                myPermissions: permissions,
                isShared: true,
              } as Note;
            }));
            subscriber.next(notes);
          }, err => {
            // Index non ancora creato o altro errore — emetti array vuoto e logga
            console.warn('[NoteService] Shared query error (index missing?):', err.code, err.message);
            subscriber.next([]);
          });
          return () => unsub();
        });

        // ── Merge: emetti quando almeno uno dei due stream emette ─────────────
        return combineLatest([
          owned$.pipe(startWith([] as Note[])),
          shared$.pipe(startWith([] as Note[])),
        ]).pipe(
          map(([owned, shared]) => [...owned, ...shared])
        );
      })
    );
  }

  /**
   * Stream real-time degli EVENTI (note con `type='event'`) visibili all'utente
   * corrente: l'unione di eventi in calendari owned + calendari subscribed.
   *
   * Implementazione (Fase 3 scaffold):
   *   1. Ascolta i calendari visibili via `collectionGroup('subscribers')
   *      where('uid','==',currentUid)` (owner auto-iscritto → cattura anche gli owned).
   *   2. Per ogni calendarId, apre uno snapshot listener su
   *      `notes where calendarId==id AND type=='event'`.
   *   3. Merge di tutti i feed in una sola emission.
   *
   * Limitazione nota (MVP): Firestore `in` ammette max 30 valori, quindi in teoria
   * potremmo usare `where('calendarId','in',[...])` con una sola query. In pratica
   * un utente può seguire >30 calendari nel medio periodo → usiamo N listener
   * separati (costo: N connections, ma ogni singola query è indicizzata).
   *
   * Per vista mese efficiente, il chiamante può filtrare lato client per range
   * temporale. Una futura ottimizzazione userà `where('reminderTime','>=',monthStart)`
   * sfruttando l'index composito `(calendarId, reminderTime)`.
   */
  getEventsStream(): Observable<Note[]> {
    return this.authService.user$.pipe(
      switchMap(user => {
        if (!user) return of([] as Note[]);

        // Stream 1: elenco calendarId visibili (owned auto-iscritti + subscribed)
        const visibleCalIds$ = new Observable<string[]>(subscriber => {
          const q = query(
            collectionGroup(this.db, 'subscribers'),
            where('uid', '==', user.uid)
          );
          const unsub = onSnapshot(q, snap => {
            const ids = snap.docs.map(d => d.ref.parent.parent!.id);
            subscriber.next(ids);
          }, err => {
            console.warn('[NoteService] getEventsStream subscribers error:', err.code, err.message);
            subscriber.next([]);
          });
          return () => unsub();
        });

        // Stream 2: per ogni calendarId un listener eventi. Merge in array piatto.
        return visibleCalIds$.pipe(
          switchMap(calIds => {
            if (calIds.length === 0) return of([] as Note[]);

            const perCal$: Observable<Note[]>[] = calIds.map(calId =>
              new Observable<Note[]>(subscriber => {
                const q = query(
                  collection(this.db, 'notes'),
                  where('calendarId', '==', calId),
                  where('type', '==', 'event')
                );
                const unsub = onSnapshot(q, snap => {
                  const events: Note[] = snap.docs.map(d => {
                    const raw = { id: d.id, ...d.data() } as any;
                    const PGP_PREFIX_EV = '-----BEGIN PGP MESSAGE-----';
                    const isCipherEv = (v: unknown) =>
                      typeof v === 'string' && (v.startsWith(AES_MARKER) || v.startsWith(PGP_PREFIX_EV));

                    if (isCipherEv(raw.title))   { raw.title = ''; }
                    if (isCipherEv(raw.content)) { raw.content = ''; }

                    if (!Array.isArray(raw.blocks) || (raw.blocks as any[]).length === 0) {
                      if (isCipherEv(raw.blocks)) {
                        raw.blocks = [];
                      } else {
                        raw.blocks = migrateToBlocks(raw);
                      }
                    }
                    // myRole qui è sempre 'owner' se raw.uid==currentUid, altrimenti
                    // semanticamente "subscriber" (lettura-only). Riusiamo il campo
                    // `myRole` esistente per coerenza con getNotes().
                    return {
                      ...raw,
                      type: 'event' as NoteType,
                      myRole: raw.uid === user.uid ? 'owner' as const : 'guest' as const,
                      myPermissions: raw.uid === user.uid
                        ? undefined
                        : { editContent: false, editReminders: false },
                    } as Note;
                  });
                  subscriber.next(events);
                }, err => {
                  console.warn('[NoteService] getEventsStream calendar', calId, 'error:', err.code, err.message);
                  subscriber.next([]);
                });
                return () => unsub();
              }).pipe(startWith([] as Note[]))
            );

            // combineLatest emette ogni volta che UNO qualsiasi dei feed cambia;
            // flatten finale e dedup by id (un event non può stare in 2 cal,
            // ma una re-entrance del listener può duplicare transitoriamente).
            return combineLatest(perCal$).pipe(
              map(lists => {
                const byId = new Map<string, Note>();
                lists.flat().forEach(n => { if (n.id) byId.set(n.id, n); });
                return Array.from(byId.values());
              })
            );
          })
        );
      })
    );
  }

  async updateNote(id: string, data: Partial<Note>, options?: { skipEncryption?: boolean }) {
    const uid = this.authService.getCurrentUserId();
    if (!uid) throw new Error('Not authenticated');

    // Guard: se guest, verifica permessi da Firestore (non dalla cache locale)
    const noteSnap = await this.freshOrCached(doc(this.db, `notes/${id}`));

    // ── Fase 3: Guard eventi di calendari non-owned ────────────────────────
    // Gli eventi (type='event') vivono in `notes` ma appartengono a un calendario
    // (`calendarId`). Un utente iscritto a un calendario altrui può LEGGERE gli
    // eventi (rules lo permettono via subscribers), ma non può modificarli.
    // Il messaggio di errore è esplicito così la UI può gestirlo con toast/banner
    // "Sola lettura — calendario condiviso". Le rules sono il backstop finale.
    if (noteSnap.exists() && noteSnap.data()?.['type'] === 'event') {
      const calendarId = noteSnap.data()?.['calendarId'];
      if (calendarId) {
        try {
          const calSnap = await this.freshOrCached(doc(this.db, `calendars/${calendarId}`));
          if (calSnap.exists() && calSnap.data()?.['uid'] !== uid) {
            throw new Error('read-only event in subscribed calendar');
          }
        } catch (err: any) {
          // Rilancia se è il nostro guard; altrimenti ignora (offline/missing calendar
          // → lasciamo decidere alle rules per non bloccare flussi legittimi).
          if (err?.message === 'read-only event in subscribed calendar') throw err;
        }
      }
    }

    if (noteSnap.exists() && noteSnap.data()?.['uid'] !== uid) {
      const collabSnap = await this.freshOrCached(doc(this.db, `notes/${id}/collaborators/${uid}`));
      const perms = collabSnap.exists() ? (collabSnap.data()?.['permissions'] ?? {}) : {};
      const reminderFields = new Set(['reminderTime', 'reminderStatus', 'recurrence', 'reminderRepeat', 'recurrenceEndDate',
        'completionNotifyPending', 'completionNotifyBy', 'completionNotifyByName', 'completionNotifyAt']);
      const hasContentFields = Object.keys(data).some(k => !reminderFields.has(k) && k !== 'updatedAt');
      const hasReminderFields = Object.keys(data).some(k => reminderFields.has(k));
      if (hasContentFields && !perms['editContent']) {
        throw new Error('Permission denied: editContent not granted');
      }
      // Se il guest non può modificare i reminder, rimuoviamo i campi dal payload
      // invece di bloccare tutto il salvataggio (buildPayload li include sempre anche se null)
      if (hasReminderFields && !perms['editReminders']) {
        reminderFields.forEach(k => delete (data as any)[k]);
      }
    }

    // ── Fase 0: gestione type + hasReminderBlock ─────────────────────────────
    // In Fase 0 non esiste ancora un FAB speed-dial che distingua Nota/Memo
    // all'atto della creazione: l'utente crea sempre type='note' per default,
    // e aggiunge reminder solo dopo via edit. Per preservare la UX pre-Fase 0
    // ("nota + reminder diventa un promemoria") permettiamo UNA promozione
    // automatica note→memo quando arriva un ReminderBlock o reminderTime.
    // Il muro netto fra tipi (Fase 1) lo introdurremo al deploy del FAB.
    const currentType = noteSnap.data()?.['type'] as NoteType | undefined;

    // Calcola se dopo l'update il doc avrà un reminder attivo.
    // Segnali in ordine di priorità:
    //   1. payload contiene `blocks` → deriva dai blocks (source of truth)
    //   2. payload contiene `reminderTime` → reminder aggiunto (valore) o rimosso (null)
    // Se nessuno dei due è nel payload, l'update non tocca lo stato reminder.
    let willHaveReminder: boolean | undefined;
    if (data.blocks !== undefined) {
      willHaveReminder = this.deriveHasReminderBlock(data.blocks as NoteBlock[]);
      data = { ...data, hasReminderBlock: willHaveReminder };
    } else if (data.reminderTime !== undefined) {
      willHaveReminder = data.reminderTime !== null && data.reminderTime !== 0;
    }

    // Guard: qualsiasi cambio di type esplicito diverso dal corrente è vietato.
    // (memo→note, note→event, memo→event ecc. richiedono "Duplica come …")
    if (data.type !== undefined && currentType !== undefined && data.type !== currentType) {
      throw new Error(
        `updateNote: type è immutabile (era "${currentType}", tentato "${data.type}"). ` +
        `Per cambiare tipo usa "Duplica come memo/evento".`
      );
    }

    // Auto-transizione type ↔ reminder (UX back-compat Fase 0):
    // - note → memo quando viene aggiunto il primo reminder
    // - memo → note quando viene rimosso l'ultimo reminder
    // In Fase 1 il FAB speed-dial renderà esplicita la scelta del tipo,
    // e questa transizione automatica verrà rimossa.
    if (data.type === undefined && willHaveReminder !== undefined) {
      if (currentType === 'note' && willHaveReminder === true) {
        data = { ...data, type: 'memo' };
      } else if (currentType === 'memo' && willHaveReminder === false) {
        data = { ...data, type: 'note' };
      }
    }
    // ─────────────────────────────────────────────────────────────────────────

    const noteRef = doc(this.db, `notes/${id}`);
    const skipFields: (keyof Note)[] = this.notifTitleEnabled ? ['title'] : [];
    const hasCollaborators = (noteSnap.data()?.['collaboratorUids']?.length ?? 0) > 0;

    let payload: any;
    if (!this.cryptoService.isEnabled || options?.skipEncryption) {
      payload = { ...data, updatedAt: Date.now() };
    } else if (hasCollaborators) {
      // Nota condivisa: cifra con AES se la chiave e disponibile in cache
      const aesKey = await this._getAESKeyForNote(id, uid);
      payload = aesKey
        ? await this.cryptoService.encryptNoteWithAESKey({ ...data, updatedAt: Date.now() }, aesKey, skipFields)
        : { ...data, updatedAt: Date.now() }; // fallback plaintext (lazy migration)
    } else {
      payload = await this.cryptoService.encryptNote({ ...data, updatedAt: Date.now() }, skipFields);
    }

    await updateDoc(noteRef, payload as any);
  }

  async deleteNote(id: string) {
    const uid = this.authService.getCurrentUserId();
    if (!uid) throw new Error('Not authenticated');

    // Guard: solo il proprietario può eliminare
    const noteSnap = await this.freshOrCached(doc(this.db, `notes/${id}`));

    // ── Fase 3: Guard eventi di calendari non-owned ────────────────────────
    // Stesso razionale di updateNote(): eventi read-only per subscriber del
    // calendario. Messaggio specifico così la UI può distinguere da "not owner".
    if (noteSnap.exists() && noteSnap.data()?.['type'] === 'event') {
      const calendarId = noteSnap.data()?.['calendarId'];
      if (calendarId) {
        try {
          const calSnap = await this.freshOrCached(doc(this.db, `calendars/${calendarId}`));
          if (calSnap.exists() && calSnap.data()?.['uid'] !== uid) {
            throw new Error('read-only event in subscribed calendar');
          }
        } catch (err: any) {
          if (err?.message === 'read-only event in subscribed calendar') throw err;
        }
      }
    }

    if (noteSnap.exists() && noteSnap.data()?.['uid'] !== uid) {
      throw new Error('Permission denied: only owner can delete');
    }

    await deleteDoc(doc(this.db, `notes/${id}`));
  }

  async getUserPreference<T>(key: string, defaultValue: T): Promise<T> {
    const uid = this.authService.getCurrentUserId();
    if (!uid) return defaultValue;
    try {
      const userRef = doc(this.db, `users/${uid}`);
      const snap = await getDoc(userRef);
      if (snap.exists()) {
        const data = snap.data();
        return (data[key] !== undefined ? data[key] : defaultValue) as T;
      }
    } catch { /* offline o permessi */ }
    return defaultValue;
  }

  async setUserPreference(key: string, value: any): Promise<void> {
    const uid = this.authService.getCurrentUserId();
    if (!uid) return;
    try {
      const userRef = doc(this.db, `users/${uid}`);
      await setDoc(userRef, { [key]: value }, { merge: true });
    } catch { /* silenzioso se offline */ }
  }

  async getUserDoc(): Promise<any | null> {
    const uid = this.authService.getCurrentUserId();
    if (!uid) return null;
    const userRef = doc(this.db, `users/${uid}`);
    try {
      // Forza lettura dal server: evita dati stale dalla cache locale (persistentLocalCache)
      const snap = await getDocFromServer(userRef);
      return snap.exists() ? snap.data() : null;
    } catch {
      return null;  // Server non raggiungibile: evita cache stale (BF-10)
    }
  }

  async saveUsername(username: string): Promise<void> {
    const uid = this.authService.getCurrentUserId();
    if (!uid) return;
    const lower = username.toLowerCase();
    const batch = writeBatch(this.db);
    batch.set(doc(this.db, `usernames/${lower}`), { uid, createdAt: Date.now() });
    batch.set(doc(this.db, `users/${uid}`), { username, usernameLower: lower }, { merge: true });
    await batch.commit();
  }

  /** Real-time listener su users/{uid}. Ritorna la funzione di unsubscribe. */
  watchUserDoc(uid: string, callback: (data: any | null) => void): () => void {
    const userRef = doc(this.db, `users/${uid}`);
    return onSnapshot(userRef, snap => {
      callback(snap.exists() ? snap.data() : null);
    }, () => callback(null));
  }

  /** Real-time listener sul subdoc collaborators/{uid} di una nota. Ritorna la funzione di unsubscribe. */
  watchCollaboratorPermissions(noteId: string, uid: string, callback: (perms: CollaboratorPermissions | null) => void): () => void {
    const collabRef = doc(this.db, `notes/${noteId}/collaborators/${uid}`);
    return onSnapshot(collabRef, snap => {
      if (snap.exists()) callback(snap.data()?.['permissions'] as CollaboratorPermissions ?? null);
      else callback(null);
    }, () => callback(null));
  }

  /** Real-time listener sul documento nota. Ritorna la funzione di unsubscribe. */
  watchNote(noteId: string, callback: (data: any) => void): () => void {
    const noteRef = doc(this.db, `notes/${noteId}`);
    return onSnapshot(noteRef, snap => {
      if (snap.exists()) callback(snap.data());
    }, () => {});
  }

  /** Legge updatedAt dal server per il check anti-overwrite. */
  async getNoteUpdatedAt(noteId: string): Promise<number | null> {
    const noteRef = doc(this.db, `notes/${noteId}`);
    const snap = await getDocFromServer(noteRef);
    return snap.exists() ? (snap.data()?.['updatedAt'] ?? null) : null;
  }

  async saveEncryptionKeys(publicKey: string, encryptedPrivateKey: string): Promise<number> {
    const uid = this.authService.getCurrentUserId();
    if (!uid) throw new Error('saveEncryptionKeys: utente non autenticato');
    const userRef = doc(this.db, `users/${uid}`);
    const snap = await getDocFromServer(userRef);
    const current = snap.exists() ? (snap.data()?.['sessionVersion'] ?? 0) : 0;
    const sessionVersion = current + 1;
    console.log('[E2E] saveEncryptionKeys — uid:', uid, 'publicKey len:', publicKey?.length);
    await setDoc(userRef, { publicKey, encryptedPrivateKey, encryptionEnabled: true, encryptionSetup: true, sessionVersion }, { merge: true });
    console.log('[E2E] saveEncryptionKeys — scritto su Firestore OK');
    return sessionVersion;
  }

  /** Aggiorna la chiave privata cifrata (dopo cambio passphrase) e incrementa sessionVersion. */
  async updateEncryptedPrivateKey(encryptedPrivateKey: string): Promise<number> {
    const uid = this.authService.getCurrentUserId();
    if (!uid) throw new Error('Not authenticated');
    const userRef = doc(this.db, `users/${uid}`);
    const snap = await getDoc(userRef);
    const current = snap.exists() ? (snap.data()?.['sessionVersion'] ?? 0) : 0;
    const sessionVersion = current + 1;
    await setDoc(userRef, { encryptedPrivateKey, sessionVersion }, { merge: true });
    return sessionVersion;
  }

  /** Elimina le chiavi di crittografia e disabilita encryption. Incrementa sessionVersion per invalidare altre sessioni. */
  async clearEncryptionKeys(): Promise<void> {
    const uid = this.authService.getCurrentUserId();
    if (!uid) throw new Error('Not authenticated');
    const userRef = doc(this.db, `users/${uid}`);
    const snap = await getDoc(userRef);
    const current = snap.exists() ? (snap.data()?.['sessionVersion'] ?? 0) : 0;
    const sessionVersion = current + 1;
    await setDoc(userRef, {
      publicKey: null,
      encryptedPrivateKey: null,
      encryptionEnabled: false,
      encryptionSetup: false,   // fondamentale: senza questo initEncryption vede encryptionSetup:true con chiavi null → broken unlock loop
      sessionVersion
    }, { merge: true });
  }

  // ─── Username ─────────────────────────────────────────────────────────────────

  /** Validates username format: 3-20 chars, alphanumeric + underscore, no leading/trailing underscore. */
  static validateUsernameFormat(username: string): boolean {
    return /^[a-zA-Z0-9][a-zA-Z0-9_]{1,18}[a-zA-Z0-9]$/.test(username);
  }

  /** Returns true if the username (case-insensitive) is available in Firestore. */
  async checkUsernameAvailability(username: string): Promise<boolean> {
    const lower = username.toLowerCase();
    const snap = await getDoc(doc(this.db, `usernames/${lower}`));
    return !snap.exists();
  }

  /** Atomic batch: creates usernames/{lower} + upserts users/{uid} with username fields. */
  async setUsername(username: string): Promise<void> {
    const uid = this.authService.getCurrentUserId();
    if (!uid) throw new Error('Not authenticated');
    const lower = username.toLowerCase();

    // Check if user already has a different username → delete old slot
    const userRef = doc(this.db, `users/${uid}`);
    const userSnap = await getDoc(userRef);
    const existingLower: string | undefined = userSnap.exists() ? userSnap.data()?.['usernameLower'] : undefined;

    const batch = writeBatch(this.db);

    if (existingLower && existingLower !== lower) {
      batch.delete(doc(this.db, `usernames/${existingLower}`));
    }

    batch.set(doc(this.db, `usernames/${lower}`), { uid, createdAt: Date.now() });
    batch.set(userRef, { username, usernameLower: lower }, { merge: true });

    await batch.commit();
  }

  /** Returns the current user's display username, or null if not set. */
  async getUsername(): Promise<string | null> {
    const uid = this.authService.getCurrentUserId();
    if (!uid) return null;
    try {
      const snap = await getDocFromServer(doc(this.db, `users/${uid}`));
      return snap.exists() ? (snap.data()?.['username'] ?? null) : null;
    } catch {
      return null;
    }
  }

  // ─── Sharing (Fase 2) ────────────────────────────────────────────────────────

  /** Aggiunge un collaboratore a una nota. Batch: crea collaborators/{guestUid} + arrayUnion su collaboratorUids. */
  async addCollaborator(
    noteId: string,
    guestUid: string,
    permissions: CollaboratorPermissions = { editContent: false, editReminders: false },
    opts?: { notificationsEnabled?: boolean }
  ): Promise<void> {
    const uid = this.authService.getCurrentUserId();
    if (!uid) throw new Error('Not authenticated');

    const batch = writeBatch(this.db);
    const collabRef = doc(this.db, `notes/${noteId}/collaborators/${guestUid}`);
    const collabData: Collaborator = {
      uid: guestUid,
      role: 'guest',
      addedAt: Date.now(),
      addedBy: uid,
      permissions,
    };
    if (opts?.notificationsEnabled !== undefined) {
      collabData.notificationsEnabled = opts.notificationsEnabled;
    }
    batch.set(collabRef, collabData);
    // updatedAt garantisce che il documento cambi in modo visibile per tutti i listener
    // onSnapshot attivi (incluso quello dell'owner), indipendentemente dal comportamento
    // di arrayUnion con offline persistence.
    batch.update(doc(this.db, `notes/${noteId}`), {
      collaboratorUids: arrayUnion(guestUid),
      updatedAt: Date.now(),
    });
    await batch.commit();
  }

  /** Rimuove un collaboratore. Batch: delete subdoc + arrayRemove da collaboratorUids. */
  async removeCollaborator(noteId: string, guestUid: string): Promise<void> {
    const batch = writeBatch(this.db);
    batch.delete(doc(this.db, `notes/${noteId}/collaborators/${guestUid}`));
    batch.update(doc(this.db, `notes/${noteId}`), {
      collaboratorUids: arrayRemove(guestUid),
      updatedAt: Date.now(),
    });
    await batch.commit();
  }

  /** Aggiorna i permessi di un collaboratore. */
  async updateCollaboratorPermissions(
    noteId: string,
    guestUid: string,
    permissions: CollaboratorPermissions
  ): Promise<void> {
    await updateDoc(doc(this.db, `notes/${noteId}/collaborators/${guestUid}`), { permissions });
  }

  /** Legge tutti i collaboratori di una nota dalla subcollection. */
  async getCollaborators(noteId: string): Promise<Collaborator[]> {
    const snap = await getDocs(collection(this.db, `notes/${noteId}/collaborators`));
    return snap.docs.map(d => d.data() as Collaborator);
  }

  /** Listener real-time sulla subcollection collaboratori. */
  watchCollaborators(noteId: string, callback: (collabs: Collaborator[]) => void): () => void {
    const ref = collection(this.db, `notes/${noteId}/collaborators`);
    return onSnapshot(ref,
      snap => callback(snap.docs.map(d => d.data() as Collaborator)),
      (err) => console.error('[watchCollaborators] snapshot error', noteId, err)
    );
  }

  /**
   * Genera un token invito sicuro (20 char alfanumerici, 62^20 ≈ 7×10^35 combinazioni)
   * e lo scrive in `invites/{token}`.
   *
   * **Firma generalizzata (Fase 3)**: accetta oggetto `{ type, resourceId }` per distinguere
   * invites note vs calendar. Gli invites note mantengono `type='note'` e scadono a 7gg;
   * gli invites calendar usano `CalendarService.createCalendarInvite()` (30gg).
   *
   * **Backward-compat**: se chiamato con una string (firma legacy `createInvite(noteId)`)
   * fallback a `type='note', resourceId=noteId`. Questo preserva i call-site esistenti
   * (sharing-panel) senza rotture.
   *
   * Il doc invite scritto include SIA il nuovo schema (`type`, `resourceId`) SIA il
   * legacy `noteId` (per compat con `acceptInvite`/`readInvite` pre-Fase 3 e con il
   * server cron se mai leggesse).
   */
  async createInvite(arg: string | { type: 'note' | 'calendar'; resourceId: string }): Promise<string> {
    const uid = this.authService.getCurrentUserId();
    if (!uid) throw new Error('Not authenticated');

    // Normalizza input (backcompat)
    const { type, resourceId } = typeof arg === 'string'
      ? { type: 'note' as const, resourceId: arg }
      : arg;

    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const bytes = crypto.getRandomValues(new Uint8Array(20));
    const token = Array.from(bytes).map(b => chars[b % chars.length]).join('');

    const now = Date.now();
    // TTL differenziato: calendar=30gg, note=7gg (cfr. piano shared-calendars.md)
    const ttl = type === 'calendar'
      ? 30 * 24 * 60 * 60 * 1000
      : 7 * 24 * 60 * 60 * 1000;

    const payload: Record<string, unknown> = {
      type,
      resourceId,
      createdBy: uid,
      createdAt: now,
      expiresAt: now + ttl,
    };
    // Backcompat: scrivi anche `noteId` per gli invites note così i consumer
    // legacy (acceptInvite/readInvite) continuano a funzionare senza leggere
    // `resourceId`. Per calendar invites questo campo è assente (non ha senso).
    if (type === 'note') {
      payload['noteId'] = resourceId;
    }

    await setDoc(doc(this.db, `invites/${token}`), payload);
    return token;
  }

  /** Accetta un invito NOTE: valida token + scadenza + type, poi chiama addCollaborator.
   *  Su memo/event il guest sceglie esplicitamente se ricevere notifiche (pattern A).
   *
   *  Post-Fase 3: rifiuta invites con `type='calendar'` (usare CalendarService.subscribeToCalendar).
   */
  async acceptInvite(token: string, opts?: { notificationsEnabled?: boolean }): Promise<string> {
    const inviteSnap = await getDoc(doc(this.db, `invites/${token}`));
    if (!inviteSnap.exists()) throw new Error('Invite not found');

    const invite = inviteSnap.data() as {
      noteId?: string;
      resourceId?: string;
      type?: 'note' | 'calendar';
      expiresAt: number;
      createdBy: string;
    };
    if (Date.now() > invite.expiresAt) {
      deleteDoc(inviteSnap.ref); // cleanup on-read, fire-and-forget
      throw new Error('Invite expired');
    }

    // Guard post-Fase 3: rifiuta calendar invites su questo path (wrong service).
    // Type mancante = legacy note invite.
    if (invite.type === 'calendar') {
      throw new Error('invite/wrong-type: use CalendarService.subscribeToCalendar');
    }

    // Risoluzione noteId con backcompat: privilegia `noteId` legacy (sempre presente
    // sugli invites note pre e post Fase 3), fallback a `resourceId`.
    const noteId = invite.noteId ?? invite.resourceId;
    if (!noteId) throw new Error('Invite malformed: missing noteId');

    const uid = this.authService.getCurrentUserId();
    if (!uid) throw new Error('Not authenticated');
    if (uid === invite.createdBy) throw new Error('Cannot accept your own invite');

    await this.addCollaborator(noteId, uid, undefined, opts);
    // Cleanup asincrono: rimuove tutti gli inviti scaduti per questa nota
    this.cleanupExpiredInvites(noteId).catch(() => {});
    return noteId;
  }

  /** Legge e valida un token invito note senza accettarlo: ritorna { noteId, createdBy } o lancia errore.
   *  Rifiuta invites `type='calendar'` con 'invite/wrong-type'. */
  async readInvite(token: string): Promise<{ noteId: string; createdBy: string }> {
    const inviteSnap = await getDoc(doc(this.db, `invites/${token}`));
    if (!inviteSnap.exists()) throw new Error('invite/not-found');
    const invite = inviteSnap.data() as {
      noteId?: string;
      resourceId?: string;
      type?: 'note' | 'calendar';
      expiresAt: number;
      createdBy: string;
    };
    if (Date.now() > invite.expiresAt) {
      deleteDoc(inviteSnap.ref); // cleanup on-read, fire-and-forget
      throw new Error('invite/expired');
    }
    if (invite.type === 'calendar') throw new Error('invite/wrong-type');
    const noteId = invite.noteId ?? invite.resourceId;
    if (!noteId) throw new Error('invite/malformed');
    return { noteId, createdBy: invite.createdBy };
  }

  /** True se il contenuto della nota in Firestore è cifrato (PGP o AES). */
  async isNoteEncrypted(noteId: string): Promise<boolean> {
    try {
      const snap = await getDoc(doc(this.db, `notes/${noteId}`));
      if (!snap.exists()) return false;
      const d = snap.data();
      return (
        (typeof d?.['title'] === 'string' && this.cryptoService.isEncryptedValue(d['title'])) ||
        (typeof d?.['content'] === 'string' && this.cryptoService.isEncryptedValue(d['content'])) ||
        (typeof d?.['blocks'] === 'string' && this.cryptoService.isEncryptedValue(d['blocks']))
      );
    } catch {
      return false;
    }
  }

  /** Cancella un singolo invite da Firestore. */
  async deleteInvite(token: string): Promise<void> {
    await deleteDoc(doc(this.db, `invites/${token}`));
  }

  /** Cancella tutti gli inviti scaduti (expiresAt <= now) per una nota. Fire-and-forget safe. */
  async cleanupExpiredInvites(noteId: string): Promise<void> {
    try {
      const snap = await getDocs(query(
        collection(this.db, 'invites'),
        where('resourceId', '==', noteId)
      ));
      const now = Date.now();
      const expired = snap.docs.filter(d => (d.data()['expiresAt'] as number) <= now);
      if (expired.length === 0) return;
      const batch = writeBatch(this.db);
      expired.forEach(d => batch.delete(d.ref));
      await batch.commit();
    } catch {
      // Non blocca il flusso principale
    }
  }

  /** Cerca un invito attivo (non scaduto) per una nota. Ritorna il token se esiste, null altrimenti. */
  async getActiveInvite(noteId: string): Promise<string | null> {
    try {
      // Filtro expiresAt client-side per evitare l'indice composito (resourceId + expiresAt)
      const snap = await getDocs(query(
        collection(this.db, 'invites'),
        where('resourceId', '==', noteId)
      ));
      const now = Date.now();
      const active = snap.docs.find(d => (d.data()['expiresAt'] as number) > now);
      return active ? active.id : null;
    } catch {
      return null;
    }
  }

  /** Legge titolo e type di una nota direttamente da Firestore (senza decriptare). */
  async readNoteMeta(noteId: string): Promise<{ title: string | null; type: string | null }> {
    try {
      const snap = await getDoc(doc(this.db, `notes/${noteId}`));
      if (!snap.exists()) return { title: null, type: null };
      const d = snap.data();
      return { title: d?.['title'] ?? null, type: d?.['type'] ?? null };
    } catch {
      return { title: null, type: null };
    }
  }

  // ─── AES key helpers ─────────────────────────────────────────────────────────

  /**
   * Carica e unwrappa la chiave AES di una nota per un dato utente.
   * Prima controlla la cache in-memory, poi Firestore (sharedKeys/{uid}).
   * Restituisce null se la chiave non e disponibile (nota pre-migrazione o offline).
   */
  private async _getAESKeyForNote(noteId: string, uid: string): Promise<CryptoKey | null> {
    const cached = this._aesKeyCache.get(noteId);
    if (cached) return cached;

    try {
      const keySnap = await getDoc(doc(this.db, `notes/${noteId}/sharedKeys/${uid}`));
      if (!keySnap.exists()) return null;
      const wrappedKey = keySnap.data()?.['wrappedKey'] as string | undefined;
      if (!wrappedKey) return null;
      const aesKey = await this.cryptoService.unwrapKeyForSelf(uid, wrappedKey);
      this._aesKeyCache.set(noteId, aesKey);
      return aesKey;
    } catch {
      return null;
    }
  }

  // ─── Share-by-code ────────────────────────────────────────────────────────────

  /**
   * Genera un codice di condivisione per una nota nel formato LOOKUP-KEY.
   * - Se esiste gia un codice attivo per la nota, lo elimina prima (policy: uno per nota).
   * - Genera o riusa la chiave AES della nota.
   * - Se la nota era PGP, decripta e ricifra con AES.
   * - Se la nota era plaintext (condivisa legacy), cifra con la nuova chiave AES.
   * - Scrive sharedKeys/{ownerUid} e invites/{lookup}.
   * Ritorna il codice nel formato LOOKUP-KEY.
   */
  async generateShareCode(noteId: string): Promise<string> {
    const uid = this.authService.getCurrentUserId();
    if (!uid) throw new Error('Not authenticated');

    // Cancella inviti attivi preesistenti per questa nota (policy: uno per nota)
    await this.revokeShareCode(noteId);

    // Carica il documento nota
    const noteSnap = await this.freshOrCached(doc(this.db, `notes/${noteId}`));
    if (!noteSnap.exists()) throw new Error('Nota non trovata');
    const noteData = noteSnap.data() as any;

    // Determina se esiste gia una chiave AES per questa nota
    let aesKey: CryptoKey | null = await this._getAESKeyForNote(noteId, uid);
    let isNewKey = false;

    if (!aesKey) {
      // Genera nuova chiave AES
      aesKey = await this.cryptoService.generateNoteKey();
      isNewKey = true;
    }

    // Migrazione del contenuto se necessario.
    // plainTitle viene estratto qui una volta sola per poi cifrarlo nell'invite.
    let plainTitle = '';
    if (isNewKey) {
      const title = noteData['title'] as string | undefined;
      const blocks = noteData['blocks'];
      const hasPGPContent = (typeof title === 'string' && this.cryptoService.isPGPEncrypted(title)) ||
                            (typeof blocks === 'string' && this.cryptoService.isPGPEncrypted(blocks));
      const hasPlaintextShared = !hasPGPContent &&
                                  !this.cryptoService.isAESEncrypted(title ?? '') &&
                                  (noteData['collaboratorUids']?.length ?? 0) > 0;

      // Decripta da PGP se necessario, poi ricifra con AES
      let plainNote: any = noteData;
      if (hasPGPContent && this.cryptoService.isEnabled) {
        plainNote = await this.cryptoService.decryptNote(noteData);
      }
      plainTitle = (plainNote['title'] as string | undefined) ?? '';

      // Cifra con AES (sia per PGP→AES che per plaintext→AES).
      // updateDoc scrive SOLO i campi cifrati (title, content, blocks) — mai
      // image, uid, createdAt o altri campi non sensibili che non devono essere
      // toccati. Questo previene qualsiasi perdita di dati anche in caso di bug
      // nello spread di encryptNoteWithAESKey.
      if (hasPGPContent || hasPlaintextShared) {
        const skipFields: (keyof Note)[] = this.notifTitleEnabled ? ['title'] : [];
        const encrypted = await this.cryptoService.encryptNoteWithAESKey(plainNote, aesKey, skipFields);

        // Firestore hard limit: 1MB per documento. Il ciphertext AES di blocks
        // può essere ~133% del plaintext. Se blocks + title + content cifrati
        // superano 900KB (margine conservativo sul totale doc), blocchiamo
        // prima della write: meglio un errore esplicito che un 'resource-exhausted'
        // silenzioso o un write parziale.
        const encPayloadSize =
          (encrypted.title   ? String(encrypted.title).length   : 0) +
          (encrypted.content ? String(encrypted.content).length : 0) +
          (encrypted.blocks  ? String(encrypted.blocks).length  : 0);
        if (encPayloadSize > 900_000) {
          throw new Error('share/note-too-large');
        }

        // Popola la cache PRIMA di updateDoc: il Firestore snapshot sull'owned stream
        // può arrivare prima del return dell'await, e _getAESKeyForNote troverebbe
        // la chiave null (sharedKeys/{uid} non ancora scritto). Con la cache già
        // popolata il decrypt del snapshot intermedio riesce senza toccare Firestore.
        this._aesKeyCache.set(noteId, aesKey);

        await updateDoc(doc(this.db, `notes/${noteId}`), {
          ...(encrypted.title !== undefined   ? { title:   encrypted.title   } : {}),
          ...(encrypted.content !== undefined ? { content: encrypted.content } : {}),
          ...(encrypted.blocks !== undefined  ? { blocks:  encrypted.blocks  } : {}),
        });
      }
    } else {
      // Chiave preesistente: decifra il titolo attuale per ottenerlo in chiaro.
      // Metti in cache subito così i snapshot intermedi non fanno fetch Firestore.
      this._aesKeyCache.set(noteId, aesKey);
      const rawTitle = noteData['title'] as string | undefined;
      if (rawTitle && this.cryptoService.isAESEncrypted(rawTitle)) {
        try { plainTitle = await this.cryptoService.decryptNoteAES(aesKey, rawTitle); } catch { plainTitle = ''; }
      } else {
        plainTitle = rawTitle ?? '';
      }
    }

    // Wrappa la chiave AES con la PGP public key dell'owner
    const userSnap = await getDoc(doc(this.db, `users/${uid}`));
    const ownerPublicKey = userSnap.data()?.['publicKey'] as string | undefined;
    if (!ownerPublicKey) throw new Error('Chiave pubblica owner non trovata');

    const wrappedKey = await this.cryptoService.wrapKeyForUser(aesKey, ownerPublicKey);
    await setDoc(doc(this.db, `notes/${noteId}/sharedKeys/${uid}`), {
      wrappedKey,
      wrappedAt: serverTimestamp(),
      wrappedBy: uid,
    });

    // Genera lookup 8-char univoco
    let lookup = '';
    let attempts = 0;
    while (attempts < 5) {
      lookup = this._generateLookup();
      const existing = await getDoc(doc(this.db, `invites/${lookup}`));
      if (!existing.exists()) break;
      attempts++;
    }
    if (attempts >= 5) throw new Error('Impossibile generare lookup univoco. Riprova.');

    // Esporta la chiave AES in base64url (questo diventa il KEY del code)
    const keyBase64url = await this.cryptoService.exportNoteKey(aesKey);

    // Cifra il titolo con la AES key per includerlo nell'invite (E2EE preview lato guest).
    // Il guest decifra localmente — il server non vede mai il plaintext.
    const encryptedTitle = await this.cryptoService.encryptNoteAES(aesKey, plainTitle);

    // Scrivi il documento invite
    const now = Date.now();
    await setDoc(doc(this.db, `invites/${lookup}`), {
      type: 'note',
      resourceId: noteId,
      noteId,
      createdBy: uid,
      createdAt: now,
      expiresAt: now + 365 * 24 * 60 * 60 * 1000,
      encryptedTitle,
    });

    return new ShareCode(lookup, keyBase64url).format();
  }

  /** Genera un lookup di SHARE_CODE_LOOKUP_LEN char dall'alfabeto condiviso. */
  private _generateLookup(): string {
    const bytes = crypto.getRandomValues(new Uint8Array(SHARE_CODE_LOOKUP_LEN));
    return Array.from(bytes)
      .map(b => SHARE_CODE_ALPHABET[b % SHARE_CODE_ALPHABET.length])
      .join('');
  }

  /**
   * Prima fase del join: valida il codice e recupera metadati per la preview.
   * NON aggiunge il collaboratore. Chiamare confirmJoinByShareCode() dopo conferma.
   */
  async joinByShareCode(rawCode: string): Promise<{ noteId: string; ownerUsername: string; noteTitle: string; docType: string | null }> {
    const code = ShareCode.parse(rawCode);
    if (!code) throw new Error('join/invalid-code');

    const uid = this.authService.getCurrentUserId();
    if (!uid) throw new Error('Not authenticated');

    // Leggi l'invite
    const inviteSnap = await getDoc(doc(this.db, `invites/${code.lookup}`));
    if (!inviteSnap.exists()) throw new Error('join/not-found');

    const invite = inviteSnap.data() as {
      noteId?: string;
      resourceId?: string;
      type?: string;
      expiresAt: number;
      createdBy: string;
    };

    if (Date.now() > invite.expiresAt) throw new Error('join/expired');
    if (invite.type === 'calendar') throw new Error('join/wrong-type');

    const noteId = invite.noteId ?? invite.resourceId;
    if (!noteId) throw new Error('join/malformed');

    if (uid === invite.createdBy) throw new Error('join/own-note');

    // Recupera username owner
    const ownerUsername = await this.getUsernameByUid(invite.createdBy) ?? invite.createdBy;

    // Decifra il titolo di preview dall'invite stesso (E2EE: nessuna read su notes/{noteId}).
    // La KEY è embedded nel codice → il guest può decifrarla prima di diventare collaboratore.
    let noteTitle = '';
    const docType: string | null = invite.type ?? null;
    try {
      const aesKey = await this.cryptoService.importNoteKey(code.key);
      const rawEncrypted = (invite as any)['encryptedTitle'] as string | undefined;
      if (rawEncrypted && this.cryptoService.isAESEncrypted(rawEncrypted)) {
        noteTitle = await this.cryptoService.decryptNoteAES(aesKey, rawEncrypted);
      }
    } catch {
      noteTitle = '';
    }

    return { noteId, ownerUsername, noteTitle, docType };
  }

  /**
   * Seconda fase del join: aggiunge il collaboratore e salva la chiave AES wrappata.
   * Chiamare solo dopo che l'utente ha confermato la preview.
   * Ritorna il noteId.
   */
  async confirmJoinByShareCode(rawCode: string, opts?: { notificationsEnabled?: boolean }): Promise<string> {
    const code = ShareCode.parse(rawCode);
    if (!code) throw new Error('join/invalid-code');

    const uid = this.authService.getCurrentUserId();
    if (!uid) throw new Error('Not authenticated');

    const inviteSnap = await getDoc(doc(this.db, `invites/${code.lookup}`));
    if (!inviteSnap.exists()) throw new Error('join/not-found');

    const invite = inviteSnap.data() as { noteId?: string; resourceId?: string; expiresAt: number; type?: string };
    if (Date.now() > invite.expiresAt) throw new Error('join/expired');

    const noteId = invite.noteId ?? invite.resourceId;
    if (!noteId) throw new Error('join/malformed');

    // Accetta l'invito (aggiunge collaboratore)
    await this.acceptInvite(code.lookup, opts);

    // Importa la chiave AES dal code
    const aesKey = await this.cryptoService.importNoteKey(code.key);

    // Aggiorna la cache in-memory
    this._aesKeyCache.set(noteId, aesKey);

    // Wrappa la chiave con la propria PGP public key e salvala su Firestore
    const userSnap = await getDoc(doc(this.db, `users/${uid}`));
    const myPublicKey = userSnap.data()?.['publicKey'] as string | undefined;
    if (myPublicKey) {
      const wrappedKey = await this.cryptoService.wrapKeyForUser(aesKey, myPublicKey);
      await setDoc(doc(this.db, `notes/${noteId}/sharedKeys/${uid}`), {
        wrappedKey,
        wrappedAt: serverTimestamp(),
        wrappedBy: uid,
      });
    }

    return noteId;
  }

  /**
   * Revoca tutti gli inviti attivi per una nota (per lookup, non per token URL).
   * Usato sia dal pannello di condivisione sia internamente prima di rigenerare.
   */
  async revokeShareCode(noteId: string): Promise<void> {
    const uid = this.authService.getCurrentUserId();
    if (!uid) throw new Error('Not authenticated');

    try {
      const snap = await getDocs(query(
        collection(this.db, 'invites'),
        where('resourceId', '==', noteId),
        where('createdBy', '==', uid)
      ));
      if (snap.empty) return;
      const batch = writeBatch(this.db);
      snap.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
    } catch {
      // Non blocca il flusso principale
    }
  }

  /**
   * Cerca un invite attivo (share-by-code) per una nota.
   * Ritorna il codice completo LOOKUP-KEY se esiste, null altrimenti.
   * Nota: la KEY non e ricostruibile da Firestore dopo la generazione — solo il LOOKUP.
   * Questo metodo e usato dallo sharing panel per sapere se esiste un codice attivo,
   * ma la KEY viene sempre rigenerata da generateShareCode().
   */
  async getActiveShareCode(noteId: string): Promise<{ lookup: string } | null> {
    try {
      const uid = this.authService.getCurrentUserId();
      if (!uid) return null;
      const snap = await getDocs(query(
        collection(this.db, 'invites'),
        where('resourceId', '==', noteId),
        where('createdBy', '==', uid)
      ));
      const now = Date.now();
      const active = snap.docs.find(d => (d.data()['expiresAt'] as number) > now);
      return active ? { lookup: active.id } : null;
    } catch {
      return null;
    }
  }

  /**
   * Ricostruisce il codice completo LOOKUP-KEY per il pannello di condivisione.
   * Cerca il documento invite attivo, poi ri-deriva la KEY decifrando sharedKeys/{uid}
   * (la AES key non è mai salvata in chiaro su Firestore — solo wrappata con PGP).
   * Funziona anche dopo un refresh completo: se la cache AES è vuota,
   * _getAESKeyForNote() carica e unwrappa da sharedKeys/{uid} automaticamente.
   * Ritorna null se non esiste un invite attivo o se la chiave non è recuperabile.
   */
  async loadFullShareCode(noteId: string): Promise<string | null> {
    try {
      const uid = this.authService.getCurrentUserId();
      if (!uid) return null;

      const snap = await getDocs(query(
        collection(this.db, 'invites'),
        where('resourceId', '==', noteId),
        where('createdBy', '==', uid)
      ));
      const now = Date.now();
      const active = snap.docs.find(d => (d.data()['expiresAt'] as number) > now);
      if (!active) return null;

      const lookup = active.id;
      const aesKey = await this._getAESKeyForNote(noteId, uid);
      if (!aesKey) return null;

      const keyBase64url = await this.cryptoService.exportNoteKey(aesKey);
      return `${lookup}-${keyBase64url}`;
    } catch {
      return null;
    }
  }

  /** Revoca tutti i collaboratori: cancella subdoc + inviti + sharedKeys del noteId + svuota collaboratorUids. Ri-cifra con PGP. */
  async revokeAllCollaborators(noteId: string): Promise<void> {
    const uid = this.authService.getCurrentUserId();
    if (!uid) throw new Error('Not authenticated');

    // NON fare getDocs su sharedKeys: le rules consentono read solo su self uid.
    // L'owner conosce già gli uid da collaboratorUids nel doc nota.
    const [collabsSnap, invitesSnap, noteSnap] = await Promise.all([
      getDocs(collection(this.db, `notes/${noteId}/collaborators`)),
      getDocs(query(collection(this.db, 'invites'), where('resourceId', '==', noteId))),
      this.freshOrCached(doc(this.db, `notes/${noteId}`)),
    ]);

    const collabUids = noteSnap.exists()
      ? ((noteSnap.data() as any)['collaboratorUids'] as string[] ?? [])
      : [];

    const batch = writeBatch(this.db);
    collabsSnap.docs.forEach(d => batch.delete(d.ref));
    invitesSnap.docs.forEach(d => batch.delete(d.ref));
    // Delete sharedKeys per uid noti: owner + tutti i collaboratori.
    // batch.delete su un doc inesistente è no-op in Firestore SDK (non genera errore).
    batch.delete(doc(this.db, `notes/${noteId}/sharedKeys/${uid}`));
    for (const cu of collabUids) {
      batch.delete(doc(this.db, `notes/${noteId}/sharedKeys/${cu}`));
    }
    batch.update(doc(this.db, `notes/${noteId}`), { collaboratorUids: [] });
    await batch.commit();

    // Rimuovi dalla cache AES (la nota torna PGP)
    this._aesKeyCache.delete(noteId);

    // Ri-cifra con PGP se encryption attiva (la nota era AES/plaintext mentre condivisa)
    if (this.cryptoService.isEnabled && uid) {
      const noteSnap = await this.freshOrCached(doc(this.db, `notes/${noteId}`));
      if (noteSnap.exists()) {
        const raw = { id: noteSnap.id, ...noteSnap.data() } as any;
        const skipFields: (keyof Note)[] = this.notifTitleEnabled ? ['title'] : [];

        // Decripta eventuale contenuto AES prima di ri-cifrare con PGP
        const hasAES = (typeof raw.title === 'string' && this.cryptoService.isAESEncrypted(raw.title)) ||
                       (typeof raw.blocks === 'string' && this.cryptoService.isAESEncrypted(raw.blocks));
        let plainNote = raw;
        if (hasAES) {
          const aesKey = await this._getAESKeyForNote(noteId, uid);
          if (aesKey) {
            plainNote = await this.cryptoService.decryptNoteWithAESKey(raw, aesKey);
          }
        }

        const encrypted = await this.cryptoService.encryptNote(plainNote, skipFields);
        await updateDoc(doc(this.db, `notes/${noteId}`), encrypted as any);
      }
    }
  }

  /** Il guest lascia una nota condivisa: rimuove se stesso da collaborators + collaboratorUids. */
  async leaveSharedNote(noteId: string): Promise<void> {
    const uid = this.authService.getCurrentUserId();
    if (!uid) throw new Error('Not authenticated');
    await this.removeCollaborator(noteId, uid);
  }

  /** Legge lo username di un utente dato il suo UID. */
  async getUsernameByUid(uid: string): Promise<string | null> {
    try {
      const snap = await getDoc(doc(this.db, `users/${uid}`));
      return snap.exists() ? (snap.data()?.['username'] ?? null) : null;
    } catch {
      return null;
    }
  }

  // ─── Presence (Fase 5) ───────────────────────────────────────────────────────

  /** Scrive/aggiorna la propria presenza nella subcollection notes/{noteId}/presence/{uid}. */
  async writePresence(noteId: string, uid: string, displayName: string, isEditing: boolean, lastActivityAt?: number): Promise<void> {
    try {
      const payload: Record<string, unknown> = { uid, displayName, lastSeen: Date.now(), isEditing };
      if (lastActivityAt !== undefined) payload['lastActivityAt'] = lastActivityAt;
      await setDoc(
        doc(this.db, `notes/${noteId}/presence/${uid}`),
        payload,
        { merge: true }
      );
    } catch { /* silenzioso — presenza non critica */ }
  }

  /** Rimuove la propria presenza alla chiusura della nota. */
  async deletePresence(noteId: string, uid: string): Promise<void> {
    try {
      await deleteDoc(doc(this.db, `notes/${noteId}/presence/${uid}`));
    } catch { /* silenzioso */ }
  }

  /**
   * Listener real-time sulla subcollection presenza. Filtra self + doc stantii (lastSeen > 30s).
   * Cleanup on-read: elimina doc con lastSeen > 60s senza await.
   */
  watchPresence(noteId: string, selfUid: string, callback: (users: PresenceEntry[]) => void): () => void {
    const presenceRef = collection(this.db, `notes/${noteId}/presence`);
    return onSnapshot(presenceRef, (snap) => {
      const now = Date.now();
      const active: PresenceEntry[] = [];
      snap.docs.forEach(d => {
        const data = d.data() as PresenceEntry;
        if (data.uid === selfUid) return; // escludi se stesso
        // Cleanup on-read: stale > 60s
        if (now - data.lastSeen > 60_000) {
          deleteDoc(d.ref);  // fire-and-forget
          return;
        }
        // Mostra solo presenze aggiornate negli ultimi 30s
        if (now - data.lastSeen <= 30_000) {
          active.push(data);
        }
      });
      callback(active);
    }, () => callback([]));
  }

  // ─── Reminder subscription per-user (Fase 1) ───────────────────────────────
  // Ogni utente ha il proprio subdoc `notes/{noteId}/reminderSnoozes/{uid}`
  // che contiene:
  //   - muted: boolean → silenzia sempre per questo utente
  //   - snoozedUntil: number | null → scadenza snooze temporaneo
  // Il cron rispetta entrambi (skip se muted OR snoozedUntil > now).
  // Quando entrambi sono "inattivi" (muted=false, snoozedUntil=null), il subdoc
  // viene eliminato per non sporcare il DB.

  /** Scrive/aggiorna la sottoscrizione reminder per-user. */
  async writeReminderSubscription(
    noteId: string,
    uid: string,
    sub: { muted?: boolean; snoozedUntil?: number | null }
  ): Promise<void> {
    const ref = doc(this.db, `notes/${noteId}/reminderSnoozes/${uid}`);
    const muted = sub.muted === true;
    const snoozedUntil = (typeof sub.snoozedUntil === 'number' && sub.snoozedUntil > 0)
      ? sub.snoozedUntil
      : null;
    const isInactive = !muted && snoozedUntil === null;
    if (isInactive) {
      await deleteDoc(ref).catch(() => {});
      return;
    }
    await setDoc(ref, {
      uid,
      snoozedBy: uid,
      muted,
      snoozedUntil,
      updatedAt: Date.now(),
    }, { merge: false });
  }

  /** Listener real-time sulla subscription reminder per-user.
   *  Ritorna null se non esiste (= stato default: notifica attiva). */
  watchReminderSubscription(
    noteId: string,
    uid: string,
    callback: (sub: { muted: boolean; snoozedUntil: number | null } | null) => void
  ): () => void {
    const ref = doc(this.db, `notes/${noteId}/reminderSnoozes/${uid}`);
    return onSnapshot(ref, snap => {
      if (!snap.exists()) { callback(null); return; }
      const data = snap.data() ?? {};
      callback({
        muted: Boolean(data['muted']),
        snoozedUntil: typeof data['snoozedUntil'] === 'number' ? data['snoozedUntil'] : null,
      });
    }, () => callback(null));
  }

  /** Shim legacy: scrive solo snoozedUntil (mantiene eventuale muted pre-esistente).
   *  Nuovi call-site usano writeReminderSubscription. */
  async writeReminderSnooze(noteId: string, uid: string, snoozedUntil: number | null): Promise<void> {
    await this.writeReminderSubscription(noteId, uid, { snoozedUntil });
  }

  /** Shim legacy: emette solo snoozedUntil (compat col watcher pre-Fase 1). */
  watchReminderSnooze(noteId: string, uid: string, callback: (snoozedUntil: number | null) => void): () => void {
    return this.watchReminderSubscription(noteId, uid, sub => {
      callback(sub?.snoozedUntil ?? null);
    });
  }

  /** Cifra in batch le note esistenti dopo il setup E2E (migrazione). */
  async encryptExistingNotes(): Promise<void> {
    const uid = this.authService.getCurrentUserId();
    if (!uid || !this.cryptoService.isEnabled) return;
    const notesRef = collection(this.db, 'notes');
    const q = query(notesRef, where('uid', '==', uid));
    const snapshot = await new Promise<any>((resolve, reject) => {
      const unsub = onSnapshot(q, snap => { unsub(); resolve(snap); }, reject);
    });
    await Promise.all(snapshot.docs.map(async (d: any) => {
      const raw = d.data();
      // Skip gia cifrate (PGP o AES) e skip note condivise (gestite da generateShareCode)
      if (raw.title && this.cryptoService.isEncryptedValue(raw.title)) return;
      if ((raw.collaboratorUids?.length ?? 0) > 0) return;
      const encrypted = await this.cryptoService.encryptNote(raw);
      await updateDoc(doc(this.db, `notes/${d.id}`), encrypted as any);
    }));
  }

  /**
   * Fresh read dal server per bypassare cache stale; fallback a cache se offline.
   * Allineato a getUserDoc/getNoteUpdatedAt ma con graceful offline fallback
   * per preservare offline-write capability (persistentLocalCache). Le rules
   * lato server restano il backstop finale.
   */
  private async freshOrCached(ref: DocumentReference): Promise<DocumentSnapshot> {
    try {
      return await getDocFromServer(ref);
    } catch (err) {
      console.warn('[freshOrCached] server read failed, falling back to cache:', err);
      return await getDoc(ref);
    }
  }
}
