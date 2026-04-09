import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TranslateModule } from '@ngx-translate/core';
@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, MatFormFieldModule, MatInputModule, MatButtonModule, MatIconModule, MatProgressSpinnerModule, TranslateModule],
  templateUrl: './login.html',
  styleUrls: ['./login.scss']
})
export class LoginComponent {
  email = '';
  password = '';
  confirmPassword = '';
  isRegistering = false;
  isRecoveringPassword = false;
  showPassword = false;
  showConfirmPassword = false;
  errorMessage = '';
  successMessage = '';
  isLoading = false;

  private authService = inject(AuthService);
  private router = inject(Router);

  get passwordReq() {
    const p = this.password;
    return {
      minLen:  p.length >= 8,
      upper:   /[A-Z]/.test(p),
      number:  /[0-9]/.test(p),
      special: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(p)
    };
  }

  get passwordAllMet(): boolean {
    const r = this.passwordReq;
    return r.minLen && r.upper && r.number && r.special;
  }

  async onSubmit() {
    if (!this.email || !this.password) return;
    this.errorMessage = '';
    this.successMessage = '';
    this.isLoading = true;
    try {
      if (this.isRegistering) {
        if (this.password !== this.confirmPassword || !this.passwordAllMet) return;
        await this.authService.register(this.email, this.password);
        await this.authService.sendVerificationEmail();
        await this.authService.logout();
        this.isRegistering = false;
        this.successMessage = 'Account creato! Controlla la tua email per verificare l\'account, poi accedi.';
        return;
      } else {
        const cred = await this.authService.login(this.email, this.password);
        if (!cred.user.emailVerified) {
          await this.authService.logout();
          this.errorMessage = 'Email non verificata. Controlla la tua casella e clicca sul link di verifica.';
          return;
        }
      }
      this.router.navigate(['/dashboard'], { replaceUrl: true });
    } catch (error: any) {
      this.errorMessage = this.getErrorMessage(error.code);
    } finally {
      this.isLoading = false;
    }
  }

  async recoverPassword() {
    if (!this.email) return;
    this.errorMessage = '';
    this.successMessage = '';
    this.isLoading = true;
    try {
      await this.authService.resetPassword(this.email);
      this.successMessage = 'Email di recupero inviata. Controlla la tua casella.';
      this.isRecoveringPassword = false;
    } catch (error: any) {
      this.errorMessage = this.getErrorMessage(error.code);
    } finally {
      this.isLoading = false;
    }
  }

  async loginWithApple() {
    this.errorMessage = '';
    this.successMessage = '';
    try {
      await this.authService.loginWithApple();
      this.router.navigate(['/dashboard'], { replaceUrl: true });
    } catch (error: any) {
      this.errorMessage = this.getErrorMessage(error.code);
    }
  }

  private getErrorMessage(code: string): string {
    switch (code) {
      case 'auth/invalid-credential':
      case 'auth/wrong-password':
      case 'auth/user-not-found':
        return 'Email o password non corretti.';
      case 'auth/email-already-in-use':
        return 'Email già registrata. Prova ad accedere.';
      case 'auth/weak-password':
        return 'Password troppo corta (minimo 6 caratteri).';
      case 'auth/invalid-email':
        return 'Indirizzo email non valido.';
      case 'auth/too-many-requests':
        return 'Troppi tentativi. Riprova tra qualche minuto.';
      default:
        return 'Si è verificato un errore. Riprova.';
    }
  }
}
