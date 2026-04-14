import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormControl, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { AuthService } from '../../services/auth';
import { NoteService } from '../../services/note';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TranslateModule } from '@ngx-translate/core';
import { UsernameInputComponent } from '../username-input/username-input';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, MatFormFieldModule, MatInputModule, MatButtonModule, MatIconModule, MatProgressSpinnerModule, TranslateModule, UsernameInputComponent],
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
  private noteService = inject(NoteService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  // Username FormControl con async validator (debounce 1.5s + checkUsernameAvailability)
  private _usernameTimer: ReturnType<typeof setTimeout> | null = null;

  private usernameAsyncValidator = (control: AbstractControl): Promise<ValidationErrors | null> => {
    return new Promise(resolve => {
      if (this._usernameTimer) clearTimeout(this._usernameTimer);
      this._usernameTimer = setTimeout(async () => {
        const v = control.value as string;
        if (!v || !NoteService.validateUsernameFormat(v)) {
          resolve({ invalid: true });
          return;
        }
        try {
          const available = await this.noteService.checkUsernameAvailability(v);
          resolve(available ? null : { taken: true });
        } catch {
          resolve(null); // fail open — non blocchiamo la registrazione su errori di rete
        }
      }, 1500);
    });
  };

  usernameControl = new FormControl('', [
    Validators.required,
    Validators.pattern(/^[a-zA-Z0-9][a-zA-Z0-9_]{1,18}[a-zA-Z0-9]$/)
  ], [this.usernameAsyncValidator]);

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

  get usernameReady(): boolean {
    return this.usernameControl.valid;
  }

  async onSubmit() {
    if (this.isLoading) return;
    if (!this.email || !this.password) return;
    this.errorMessage = '';
    this.successMessage = '';
    this.isLoading = true;
    try {
      if (this.isRegistering) {
        if (this.password !== this.confirmPassword || !this.passwordAllMet || !this.usernameReady) {
          if (this.password !== this.confirmPassword) {
            this.errorMessage = 'Le password non corrispondono.';
          }
          return;
        }
        const username = this.usernameControl.value ?? '';
        await this.authService.register(this.email, this.password);
        // Utente autenticato: salva username su Firestore prima del logout
        try {
          await this.noteService.setUsername(username);
        } catch {
          // Fallback: conserva in localStorage, verrà scritto al primo login
          localStorage.setItem('pendingUsername', username);
        }
        // Fire-and-forget: non blocchiamo il flusso su sendVerificationEmail
        // (può hangare su reti lente/flaky senza timeout → isLoading bloccato)
        this.authService.sendVerificationEmail().catch(() => {});
        try { await this.authService.logout(); } catch {}
        this.isRegistering = false;
        this.usernameControl.reset('');
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
      this.navigateAfterAuth();
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
      this.navigateAfterAuth();
    } catch (error: any) {
      this.errorMessage = this.getErrorMessage(error.code);
    }
  }

  private navigateAfterAuth() {
    const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
    if (returnUrl) {
      this.router.navigateByUrl(returnUrl, { replaceUrl: true });
    } else {
      this.router.navigate(['/dashboard'], { replaceUrl: true });
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
