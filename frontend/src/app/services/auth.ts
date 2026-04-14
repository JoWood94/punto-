import { Injectable, inject } from '@angular/core';
import { Auth, authState, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, User, OAuthProvider, signInWithPopup, sendPasswordResetEmail, sendEmailVerification } from '@angular/fire/auth';
import { Observable } from 'rxjs';
import { getApp } from 'firebase/app';
import { getFirestore, doc, writeBatch, setDoc, waitForPendingWrites } from 'firebase/firestore';
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
    if (username) {
      try {
        await cred.user.getIdToken();
        const db = getFirestore(getApp());
        const lower = username.toLowerCase();
        const uid = cred.user.uid;

        // Scrittura critica users/{uid}: awaited + waitForPendingWrites garantisce
        // che il server confermi prima del logout (altrimenti offline persistence
        // mette in coda e il logout invalida il token prima della sync)
        await setDoc(doc(db, `users/${uid}`), { username, usernameLower: lower }, { merge: true });
        await waitForPendingWrites(db);

        // Indice usernames: secondario, non blocca
        setDoc(doc(db, `usernames/${lower}`), { uid, createdAt: Date.now() })
          .catch((e) => console.warn('[register] usernames index write failed:', e));
      } catch(e) {
        console.error('[register] username write failed:', e);
      }
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
