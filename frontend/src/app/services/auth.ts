import { Injectable, inject } from '@angular/core';
import { Auth, authState, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, User, OAuthProvider, signInWithPopup, sendPasswordResetEmail } from '@angular/fire/auth';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private auth: Auth = inject(Auth);
  
  public readonly user$: Observable<User | null> = authState(this.auth);

  constructor() {}

  login(email: string, pass: string) {
    return signInWithEmailAndPassword(this.auth, email, pass);
  }

  register(email: string, pass: string) {
    return createUserWithEmailAndPassword(this.auth, email, pass);
  }

  resetPassword(email: string) {
    return sendPasswordResetEmail(this.auth, email);
  }

  logout() {
    return signOut(this.auth);
  }

  async loginWithApple() {
    const provider = new OAuthProvider('apple.com');
    // provider.addScope('email');
    // provider.addScope('name');
    return signInWithPopup(this.auth, provider);
  }
  
  getCurrentUserId(): string | null {
    return this.auth.currentUser?.uid || null;
  }
}
