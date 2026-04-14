import { Injectable, inject } from '@angular/core';
import { Auth, authState, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, User, OAuthProvider, signInWithPopup, sendPasswordResetEmail, sendEmailVerification } from '@angular/fire/auth';
import { Observable } from 'rxjs';
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

  async register(email: string, pass: string) {
    return createUserWithEmailAndPassword(this.auth, email, pass);
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
