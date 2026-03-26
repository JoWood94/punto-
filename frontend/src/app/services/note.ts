import { Injectable, inject } from '@angular/core';
import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  collection, doc, addDoc, updateDoc, deleteDoc, query, where, onSnapshot, getDoc, setDoc, Firestore as RawFirestore
} from 'firebase/firestore';
import { Observable, of, switchMap } from 'rxjs';
import { AuthService } from './auth';
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
  recurrence: 'none' | 'daily' | 'weekly' | 'monthly';
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
  // Legacy flat fields — kept for server backward compatibility
  content?: string;
  reminderTime?: number | null;
  reminderStatus?: 'pending' | 'sent' | null;
  recurrence?: 'none' | 'daily' | 'weekly' | 'monthly';
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
    const result = await addDoc(notesRef, { ...noteData, uid, createdAt: Date.now() });
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
          const unsubscribe = onSnapshot(q, snapshot => {
            const notes = snapshot.docs.map(d => {
              const raw = { id: d.id, ...d.data() } as any;
              if (!raw.blocks || raw.blocks.length === 0) {
                raw.blocks = migrateToBlocks(raw);
              }
              return raw as Note;
            });
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
    await updateDoc(noteRef, { ...data, updatedAt: Date.now() } as any);
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
}
