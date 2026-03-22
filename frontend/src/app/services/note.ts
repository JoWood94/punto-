import { Injectable, inject } from '@angular/core';
import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getFirestore, collection, doc, addDoc, updateDoc, deleteDoc, query, where, onSnapshot, Firestore as RawFirestore } from 'firebase/firestore';
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
    // Use existing Firebase app or initialize a new one
    const app: FirebaseApp = getApps().length ? getApp() : initializeApp(environment.firebase);
    this.db = getFirestore(app);
  }

  async createNote(noteData: Partial<Note>): Promise<any> {
    const uid = this.authService.getCurrentUserId();
    if (!uid) throw new Error('Not authenticated');

    const notesRef = collection(this.db, 'notes');
    return addDoc(notesRef, {
      ...noteData,
      uid,
      createdAt: Date.now()
    });
  }

  getNotes(): Observable<Note[]> {
    return this.authService.user$.pipe(
      switchMap(user => {
        if (!user) return of([]);
        const notesRef = collection(this.db, 'notes');
        const q = query(notesRef, where('uid', '==', user.uid));
        return new Observable<Note[]>(subscriber => {
          const unsubscribe = onSnapshot(q, (snapshot) => {
            const notes = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Note));
            subscriber.next(notes);
          }, (error) => {
            subscriber.error(error);
          });
          return () => unsubscribe();
        });
      })
    );
  }

  updateNote(id: string, data: Partial<Note>) {
    const noteRef = doc(this.db, `notes/${id}`);
    return updateDoc(noteRef, data);
  }

  deleteNote(id: string) {
    const noteRef = doc(this.db, `notes/${id}`);
    return deleteDoc(noteRef);
  }
}
