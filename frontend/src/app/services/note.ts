import { Injectable, inject, Injector, runInInjectionContext } from '@angular/core';
import { Firestore, collectionData } from '@angular/fire/firestore';
import { collection, doc, addDoc, updateDoc, deleteDoc, query, where, getFirestore } from 'firebase/firestore';
import { Observable, of, switchMap } from 'rxjs';
import { AuthService } from './auth';

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
  private firestore: Firestore = inject(Firestore);
  private authService: AuthService = inject(AuthService);
  private injector = inject(Injector);

  private get rawFirestore() {
    return getFirestore();
  }

  async createNote(noteData: Partial<Note>): Promise<any> {
    const uid = this.authService.getCurrentUserId();
    if (!uid) throw new Error('Not authenticated');

    const notesRef = collection(this.rawFirestore, 'notes');
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
        return runInInjectionContext(this.injector, () => {
          const notesRef = collection(this.rawFirestore, 'notes');
          const q = query(notesRef, where('uid', '==', user.uid));
          return collectionData(q, { idField: 'id' }) as Observable<Note[]>;
        });
      })
    );
  }

  updateNote(id: string, data: Partial<Note>) {
    const noteRef = doc(this.rawFirestore, `notes/${id}`);
    return updateDoc(noteRef, data);
  }

  deleteNote(id: string) {
    const noteRef = doc(this.rawFirestore, `notes/${id}`);
    return deleteDoc(noteRef);
  }
}
