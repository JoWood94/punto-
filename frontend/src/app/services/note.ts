import { Injectable, inject } from '@angular/core';
import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager, collection, doc, addDoc, updateDoc, deleteDoc, query, where, onSnapshot, Firestore as RawFirestore } from 'firebase/firestore';
import { Observable, of, switchMap } from 'rxjs';
import { AuthService } from './auth';
import { environment } from '../../environments/environment';

export interface Note {
  id?: string;
  uid: string;
  title: string;
  content: string; 
  checklist?: {text: string, done: boolean}[];
  address: string;
  lat?: number;
  lon?: number;
  reminderTime: number | null; 
  reminderStatus?: 'pending' | 'sent' | null; 
  color: string;
  createdAt: number;
}

@Injectable({
  providedIn: 'root'
})
export class NoteService {
  private authService: AuthService = inject(AuthService);
  private db: RawFirestore;

  constructor() {
    const app: FirebaseApp = getApps().length ? getApp() : initializeApp(environment.firebase);
    
    // Ensure Auth is linked to the same app so Firestore sends auth tokens
    const auth = getAuth(app);
    console.log('[NoteService] Auth linked. Current user:', auth.currentUser?.uid || 'none yet (will restore)');

    // Initialize Firestore with IndexedDB persistence
    try {
      this.db = initializeFirestore(app, {
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager()
        })
      });
      console.log('[NoteService] Firestore initialized with IndexedDB persistence');
    } catch (e) {
      // Already initialized (e.g. by AngularFire Messaging), use existing
      this.db = getFirestore(app);
      console.log('[NoteService] Using existing Firestore instance');
    }
  }

  async createNote(noteData: Partial<Note>): Promise<any> {
    const uid = this.authService.getCurrentUserId();
    if (!uid) throw new Error('Not authenticated');

    console.log('[NoteService] createNote for uid:', uid);
    const notesRef = collection(this.db, 'notes');
    const result = await addDoc(notesRef, {
      ...noteData,
      uid,
      createdAt: Date.now()
    });
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
        
        // Verify raw auth is also ready
        const auth = getAuth();
        console.log('[NoteService] Raw auth currentUser:', auth.currentUser?.uid || 'null');
        
        const notesRef = collection(this.db, 'notes');
        const q = query(notesRef, where('uid', '==', user.uid));
        return new Observable<Note[]>(subscriber => {
          const unsubscribe = onSnapshot(q, (snapshot) => {
            const notes = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Note));
            console.log('[NoteService] Got', notes.length, 'notes. fromCache:', snapshot.metadata.fromCache);
            subscriber.next(notes);
          }, (error) => {
            console.error('[NoteService] Query error:', error.code, error.message);
            subscriber.error(error);
          });
          return () => unsubscribe();
        });
      })
    );
  }

  async updateNote(id: string, data: Partial<Note>) {
    const noteRef = doc(this.db, `notes/${id}`);
    await updateDoc(noteRef, data);
  }

  async deleteNote(id: string) {
    const noteRef = doc(this.db, `notes/${id}`);
    await deleteDoc(noteRef);
  }
}
