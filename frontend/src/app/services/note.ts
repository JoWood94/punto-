import { Injectable, inject } from '@angular/core';
import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, collection, doc, addDoc, updateDoc, deleteDoc, query, where, onSnapshot, Firestore as RawFirestore } from 'firebase/firestore';
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
    
    // Initialize Firestore with IndexedDB persistence so data survives page refreshes
    try {
      this.db = initializeFirestore(app, {
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager()
        })
      });
      console.log('[NoteService] Firestore initialized with IndexedDB persistence');
    } catch (e) {
      // If already initialized (e.g. HMR), get existing instance
      const { getFirestore } = require('firebase/firestore');
      this.db = getFirestore(app);
      console.log('[NoteService] Firestore already initialized, using existing instance');
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
    console.log('[NoteService] Note created with ID:', result.id);
    return result;
  }

  getNotes(): Observable<Note[]> {
    return this.authService.user$.pipe(
      switchMap(user => {
        console.log('[NoteService] user$ emitted:', user?.uid || 'null');
        if (!user) return of([]);
        const notesRef = collection(this.db, 'notes');
        const q = query(notesRef, where('uid', '==', user.uid));
        return new Observable<Note[]>(subscriber => {
          console.log('[NoteService] Subscribing to onSnapshot for uid:', user.uid);
          const unsubscribe = onSnapshot(q, (snapshot) => {
            const notes = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Note));
            console.log('[NoteService] onSnapshot received', notes.length, 'notes. fromCache:', snapshot.metadata.fromCache, 'hasPendingWrites:', snapshot.metadata.hasPendingWrites);
            subscriber.next(notes);
          }, (error) => {
            console.error('[NoteService] onSnapshot ERROR:', error.code, error.message);
            subscriber.error(error);
          });
          return () => unsubscribe();
        });
      })
    );
  }

  async updateNote(id: string, data: Partial<Note>) {
    console.log('[NoteService] updateNote:', id);
    const noteRef = doc(this.db, `notes/${id}`);
    await updateDoc(noteRef, data);
    console.log('[NoteService] Note updated:', id);
  }

  async deleteNote(id: string) {
    console.log('[NoteService] deleteNote:', id);
    const noteRef = doc(this.db, `notes/${id}`);
    await deleteDoc(noteRef);
    console.log('[NoteService] Note deleted:', id);
  }
}
