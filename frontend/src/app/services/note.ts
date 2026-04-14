import { Injectable, inject } from '@angular/core';
import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  collection, doc, addDoc, updateDoc, deleteDoc, query, where, onSnapshot, getDoc, getDocFromServer, setDoc, writeBatch, arrayUnion, arrayRemove, getDocs, Firestore as RawFirestore
} from 'firebase/firestore';
import { Observable, of, switchMap, combineLatest, startWith, map } from 'rxjs';
import { AuthService } from './auth';
import { CryptoService } from './crypto';
import { environment } from '../../environments/environment';

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
}

export interface ImageBlock {
  type: 'image';
  url: string;
  storagePath: string;
  caption?: string;
}

export interface LinkBlock {
  type: 'link';
  url: string;
  label?: string; // testo visualizzato; se assente si mostra l'URL
}

export type NoteBlock = TextBlock | ChecklistBlock | LocationBlock | ReminderBlock | ImageBlock | LinkBlock;

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
}

export interface PresenceEntry {
  uid: string;
  displayName: string;  // username o primo carattere dell'uid
  lastSeen: number;     // Date.now() ms
  isEditing: boolean;
}

// ─── Note Interface ───────────────────────────────────────────────────────────

export interface Note {
  id?: string;
  uid: string;
  title: string;
  blocks: NoteBlock[];
  pinned?: boolean;
  tags?: string[];
  color: string;
  createdAt: number;
  updatedAt?: number;
  reminderRepeat?: 'daily' | 'weekly' | 'monthly' | 'yearly';
  // Legacy flat fields — kept for server backward compatibility
  content?: string;
  reminderTime?: number | null;
  reminderStatus?: 'pending' | 'sent' | 'completed' | null;
  lastCompletedAt?: number;
  recurrence?: 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';
  recurrenceEndDate?: number | null;
  // Sharing (Fase 2)
  collaboratorUids?: string[];
  isShared?: boolean;                        // computed: collaboratorUids?.length > 0
  myRole?: 'owner' | 'guest';               // set in getNotes()
  myPermissions?: CollaboratorPermissions;   // set in getNotes() for guests
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

  setNotifTitleEnabled(val: boolean) { this.notifTitleEnabled = val; }

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
    console.log('[NoteService] createNote for uid:', uid);
    const notesRef = collection(this.db, 'notes');
    const skipFields: (keyof Note)[] = this.notifTitleEnabled ? ['title'] : [];
    const hasCollaborators = (noteData.collaboratorUids?.length ?? 0) > 0;
    const payload = this.cryptoService.isEnabled && !hasCollaborators
      ? await this.cryptoService.encryptNote({ ...noteData, uid, createdAt: Date.now() }, skipFields)
      : { ...noteData, uid, createdAt: Date.now() };
    const result = await addDoc(notesRef, payload);
    console.log('[NoteService] Note saved with ID:', result.id);
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
              const decrypted = this.cryptoService.isEnabled
                ? await this.cryptoService.decryptNote(raw)
                : raw;
              if (!decrypted.blocks || (decrypted.blocks as any[]).length === 0) {
                (decrypted as any).blocks = migrateToBlocks(decrypted);
              }
              return {
                ...decrypted,
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
              // Note condivise sono in chiaro — NO decrypt
              if (!raw.blocks || (raw.blocks as any[]).length === 0) {
                raw.blocks = migrateToBlocks(raw);
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
                ...raw,
                myRole: 'guest' as const,
                myPermissions: permissions,
                isShared: true,
              } as Note;
            }));
            console.log('[NoteService] Shared notes:', notes.length);
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

  async updateNote(id: string, data: Partial<Note>, options?: { skipEncryption?: boolean }) {
    const uid = this.authService.getCurrentUserId();
    if (!uid) throw new Error('Not authenticated');

    // Guard: se guest, verifica permessi da Firestore (non dalla cache locale)
    const noteSnap = await getDoc(doc(this.db, `notes/${id}`));
    if (noteSnap.exists() && noteSnap.data()?.['uid'] !== uid) {
      const collabSnap = await getDoc(doc(this.db, `notes/${id}/collaborators/${uid}`));
      const perms = collabSnap.exists() ? (collabSnap.data()?.['permissions'] ?? {}) : {};
      const reminderFields = new Set(['reminderTime', 'reminderStatus', 'recurrence', 'reminderRepeat', 'recurrenceEndDate']);
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

    const noteRef = doc(this.db, `notes/${id}`);
    const skipFields: (keyof Note)[] = this.notifTitleEnabled ? ['title'] : [];
    // Note condivise non vengono cifrate (collaboratorUids non vuoto = in chiaro)
    const hasCollaborators = (noteSnap.data()?.['collaboratorUids']?.length ?? 0) > 0;
    const shouldEncrypt = this.cryptoService.isEnabled && !hasCollaborators && !options?.skipEncryption;
    const payload = shouldEncrypt
      ? await this.cryptoService.encryptNote({ ...data, updatedAt: Date.now() }, skipFields)
      : { ...data, updatedAt: Date.now() };
    await updateDoc(noteRef, payload as any);
  }

  async deleteNote(id: string) {
    const uid = this.authService.getCurrentUserId();
    if (!uid) throw new Error('Not authenticated');

    // Guard: solo il proprietario può eliminare
    const noteSnap = await getDoc(doc(this.db, `notes/${id}`));
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
    permissions: CollaboratorPermissions = { editContent: false, editReminders: false }
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

  /** Genera un token invito sicuro (20 char alfanumerici) e lo scrive in invites/{token}. Scade dopo 7 giorni. */
  async createInvite(noteId: string): Promise<string> {
    const uid = this.authService.getCurrentUserId();
    if (!uid) throw new Error('Not authenticated');

    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const bytes = crypto.getRandomValues(new Uint8Array(20));
    const token = Array.from(bytes).map(b => chars[b % chars.length]).join('');

    const now = Date.now();
    await setDoc(doc(this.db, `invites/${token}`), {
      noteId,
      createdBy: uid,
      createdAt: now,
      expiresAt: now + 7 * 24 * 60 * 60 * 1000,
    });

    return token;
  }

  /** Accetta un invito: valida token + scadenza, poi chiama addCollaborator. */
  async acceptInvite(token: string): Promise<string> {
    const inviteSnap = await getDoc(doc(this.db, `invites/${token}`));
    if (!inviteSnap.exists()) throw new Error('Invite not found');

    const invite = inviteSnap.data() as { noteId: string; expiresAt: number; createdBy: string };
    if (Date.now() > invite.expiresAt) {
      deleteDoc(inviteSnap.ref); // cleanup on-read, fire-and-forget
      throw new Error('Invite expired');
    }

    const uid = this.authService.getCurrentUserId();
    if (!uid) throw new Error('Not authenticated');
    if (uid === invite.createdBy) throw new Error('Cannot accept your own invite');

    await this.addCollaborator(invite.noteId, uid);
    // Cleanup asincrono: rimuove tutti gli inviti scaduti per questa nota
    this.cleanupExpiredInvites(invite.noteId).catch(() => {});
    return invite.noteId;
  }

  /** Legge e valida un token invito senza accettarlo: ritorna { noteId, createdBy } o lancia errore. */
  async readInvite(token: string): Promise<{ noteId: string; createdBy: string }> {
    const inviteSnap = await getDoc(doc(this.db, `invites/${token}`));
    if (!inviteSnap.exists()) throw new Error('invite/not-found');
    const invite = inviteSnap.data() as { noteId: string; expiresAt: number; createdBy: string };
    if (Date.now() > invite.expiresAt) {
      deleteDoc(inviteSnap.ref); // cleanup on-read, fire-and-forget
      throw new Error('invite/expired');
    }
    return { noteId: invite.noteId, createdBy: invite.createdBy };
  }

  /** True se il contenuto della nota in Firestore è effettivamente cifrato con PGP. */
  async isNoteEncrypted(noteId: string): Promise<boolean> {
    try {
      const snap = await getDoc(doc(this.db, `notes/${noteId}`));
      if (!snap.exists()) return false;
      const d = snap.data();
      const PGP_MARKER = '-----BEGIN PGP MESSAGE-----';
      return (
        (typeof d?.['title'] === 'string' && d['title'].startsWith(PGP_MARKER)) ||
        (typeof d?.['content'] === 'string' && d['content'].startsWith(PGP_MARKER)) ||
        (typeof d?.['blocks'] === 'string' && d['blocks'].startsWith(PGP_MARKER))
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
        where('noteId', '==', noteId)
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
      // Filtro expiresAt client-side per evitare l'indice composito (noteId + expiresAt)
      const snap = await getDocs(query(
        collection(this.db, 'invites'),
        where('noteId', '==', noteId)
      ));
      const now = Date.now();
      const active = snap.docs.find(d => (d.data()['expiresAt'] as number) > now);
      return active ? active.id : null;
    } catch {
      return null;
    }
  }

  /** Legge il titolo di una nota direttamente da Firestore (senza decriptare). */
  async readNoteTitle(noteId: string): Promise<string | null> {
    try {
      const snap = await getDoc(doc(this.db, `notes/${noteId}`));
      return snap.exists() ? (snap.data()?.['title'] ?? null) : null;
    } catch {
      return null;
    }
  }

  /** Revoca tutti i collaboratori: cancella subdoc + inviti del noteId + svuota collaboratorUids. Se encryption attiva, ri-cifra la nota. */
  async revokeAllCollaborators(noteId: string): Promise<void> {
    const [collabsSnap, invitesSnap] = await Promise.all([
      getDocs(collection(this.db, `notes/${noteId}/collaborators`)),
      getDocs(query(collection(this.db, 'invites'), where('noteId', '==', noteId))),
    ]);

    const batch = writeBatch(this.db);
    collabsSnap.docs.forEach(d => batch.delete(d.ref));
    invitesSnap.docs.forEach(d => batch.delete(d.ref));
    batch.update(doc(this.db, `notes/${noteId}`), { collaboratorUids: [] });
    await batch.commit();

    // Ri-cifra se encryption attiva (la nota era in chiaro mentre condivisa)
    if (this.cryptoService.isEnabled) {
      const noteSnap = await getDoc(doc(this.db, `notes/${noteId}`));
      if (noteSnap.exists()) {
        const raw = { id: noteSnap.id, ...noteSnap.data() } as any;
        const skipFields: (keyof Note)[] = this.notifTitleEnabled ? ['title'] : [];
        const encrypted = await this.cryptoService.encryptNote(raw, skipFields);
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
  async writePresence(noteId: string, uid: string, displayName: string, isEditing: boolean): Promise<void> {
    try {
      await setDoc(
        doc(this.db, `notes/${noteId}/presence/${uid}`),
        { uid, displayName, lastSeen: Date.now(), isEditing },
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
      // Skip already encrypted notes (title starts with PGP marker)
      if (raw.title && raw.title.startsWith('-----BEGIN PGP MESSAGE-----')) return;
      const encrypted = await this.cryptoService.encryptNote(raw);
      await updateDoc(doc(this.db, `notes/${d.id}`), encrypted as any);
    }));
  }
}
