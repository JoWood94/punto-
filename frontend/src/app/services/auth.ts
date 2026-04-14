import { Injectable, inject } from '@angular/core';
import { Auth, authState, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, User, OAuthProvider, signInWithPopup, sendPasswordResetEmail, sendEmailVerification } from '@angular/fire/auth';
import { Observable } from 'rxjs';
import { getApp } from 'firebase/app';
import { getFirestore, doc, writeBatch } from 'firebase/firestore';
import { CryptoService } from './crypto';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private auth: Auth = inject(Auth);
  private cryptoService: CryptoService = inject(CryptoService);

  public readonly user$: Observable<User | null> = authState(this.auth);

  constructor() {}

  login(email: string, pass: string) {
    return signInWithEmailAndPassword(this.auth, email, pass);
  }

  async register(email: string, pass: string, username?: string) {
    const cred = await createUserWithEmailAndPassword(this.auth, email, pass);
    console.log('[register] username ricevuto:', username, '| uid:', cred.user.uid);
    if (username) {
      // getIdToken() garantisce che il token sia propagato all'auth state di Firestore
      // prima del commit (senza questo, batch.commit() può fallire silenziosamente
      // perché Firestore non ha ancora il token del nuovo utente).
      // Fire-and-forget comunque: evita hang da IndexedDB lock contention (multi-tab persistence).
      cred.user.getIdToken().then((token) => {
        console.log('[register] getIdToken() ok, token (primi 20):', token.slice(0, 20));
        const db = getFirestore(getApp());
        const lower = username.toLowerCase();
        const uid = cred.user.uid;
        const batch = writeBatch(db);
        batch.set(doc(db, `usernames/${lower}`), { uid, createdAt: Date.now() });
        batch.set(doc(db, `users/${uid}`), { username, usernameLower: lower }, { merge: true });
        return batch.commit();
      }).then(() => {
        console.log('[register] batch.commit() OK — username scritto su Firestore');
      }).catch((err) => {
        console.error('[register] ERRORE batch.commit():', err?.code ?? err?.message ?? err);
      });
    }
    return cred;
  }

  resetPassword(email: string) {
    return sendPasswordResetEmail(this.auth, email);
  }

  logout() {
    const uid = this.auth.currentUser?.uid;
    if (uid) {
      this.cryptoService.clearLocalKey(uid);
      this.cryptoService.clearLocalSessionVersion(uid);
    }
    this.cryptoService.clearSession();
    return signOut(this.auth);
  }

  async loginWithApple() {
    const provider = new OAuthProvider('apple.com');
    // provider.addScope('email');
    // provider.addScope('name');
    return signInWithPopup(this.auth, provider);
  }
  
  sendVerificationEmail() {
    const user = this.auth.currentUser;
    if (!user) return Promise.resolve();
    return sendEmailVerification(user);
  }

  async reloadUser(): Promise<void> {
    const user = this.auth.currentUser;
    if (user) await user.reload();
  }

  getCurrentUserId(): string | null {
    return this.auth.currentUser?.uid || null;
  }
}
