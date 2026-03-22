import { Injectable, inject } from '@angular/core';
import { Firestore, collection, doc, collectionData, docData, setDoc, addDoc, updateDoc, deleteDoc, query, where } from '@angular/fire/firestore';
import { Observable, of, switchMap } from 'rxjs';
import { AuthService } from './auth';

export interface Note {
  id?: string;
  uid: string;
  title: string;
  content: string; 
  tags: string[];
  address: string;
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

  async createNote(noteData: Partial<Note>): Promise<any> {
    const uid = this.authService.getCurrentUserId();
    if (!uid) throw new Error('Not authenticated');

    const notesRef = collection(this.firestore, 'notes');
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
        const notesRef = collection(this.firestore, 'notes');
        const q = query(notesRef, where('uid', '==', user.uid));
        return collectionData(q, { idField: 'id' }) as Observable<Note[]>;
      })
    );
  }

  updateNote(id: string, data: Partial<Note>) {
    const noteRef = doc(this.firestore, `notes/${id}`);
    return updateDoc(noteRef, data);
  }

  deleteNote(id: string) {
    const noteRef = doc(this.firestore, `notes/${id}`);
    return deleteDoc(noteRef);
  }
}
