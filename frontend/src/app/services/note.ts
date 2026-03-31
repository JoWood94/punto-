import { Injectable, inject } from '@angular/core';
import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  collection, doc, addDoc, updateDoc, deleteDoc, query, where, onSnapshot, getDoc, getDocFromServer, setDoc, Firestore as RawFirestore
} from 'firebase/firestore';
import { Observable, of, switchMap } from 'rxjs';
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
  status: 'pending' | 'sent' | null;
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
  reminderStatus?: 'pending' | 'sent' | null;
  recurrence?: 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';
}

// ─── Utilities ────────────────────────────────────────────────────────────────

/** Converts legacy flat-field note to the block model. Idempotent. */
export function migrateToBlocks(note: any): NoteBlock[] {
  if (note.blocks && note.blocks.length > 0) return note.blocks as NoteBlock[];
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
    const payload = this.cryptoService.isEnabled
      ? await this.cryptoService.encryptNote({ ...noteData, uid, createdAt: Date.now() })
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
        const q = query(notesRef, where('uid', '==', user.uid));
        return new Observable<Note[]>(subscriber => {
          const unsubscribe = onSnapshot(q, async snapshot => {
            const raws = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as any));
            const notes: Note[] = await Promise.all(raws.map(async raw => {
              const decrypted = this.cryptoService.isEnabled
                ? await this.cryptoService.decryptNote(raw)
                : raw;
              if (!decrypted.blocks || (decrypted.blocks as any[]).length === 0) {
                (decrypted as any).blocks = migrateToBlocks(decrypted);
              }
              return decrypted as Note;
            }));
            console.log('[NoteService] Got', notes.length, 'notes. fromCache:', snapshot.metadata.fromCache);
            subscriber.next(notes);
          }, err => {
            console.error('[NoteService] Query error:', err.code, err.message);
            subscriber.error(err);
          });
          return () => unsubscribe();
        });
      })
    );
  }

  async updateNote(id: string, data: Partial<Note>) {
    const noteRef = doc(this.db, `notes/${id}`);
    const payload = this.cryptoService.isEnabled
      ? await this.cryptoService.encryptNote({ ...data, updatedAt: Date.now() })
      : { ...data, updatedAt: Date.now() };
    await updateDoc(noteRef, payload as any);
  }

  async deleteNote(id: string) {
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

  /** Real-time listener su users/{uid}. Ritorna la funzione di unsubscribe. */
  watchUserDoc(uid: string, callback: (data: any | null) => void): () => void {
    const userRef = doc(this.db, `users/${uid}`);
    return onSnapshot(userRef, snap => {
      callback(snap.exists() ? snap.data() : null);
    }, () => callback(null));
  }

  async saveEncryptionKeys(publicKey: string, encryptedPrivateKey: string): Promise<number> {
    const uid = this.authService.getCurrentUserId();
    if (!uid) throw new Error('saveEncryptionKeys: utente non autenticato');
    const userRef = doc(this.db, `users/${uid}`);
    const sessionVersion = 1;
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
