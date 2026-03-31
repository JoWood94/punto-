import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, MatFormFieldModule, MatInputModule, MatButtonModule, MatIconModule],
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

  private authService = inject(AuthService);
  private router = inject(Router);

  async onSubmit() {
    if (!this.email || !this.password) return;
    this.errorMessage = '';
    this.successMessage = '';
    try {
      if (this.isRegistering) {
        if (this.password !== this.confirmPassword) return;
        await this.authService.register(this.email, this.password);
        await this.authService.sendVerificationEmail();
        await this.authService.logout();
        this.isRegistering = false;
        this.successMessage = 'Account creato! Controlla la tua email per verificare l\'account, poi accedi.';
        return;
      } else {
        await this.authService.login(this.email, this.password);
      }
      this.router.navigate(['/dashboard'], { replaceUrl: true });
    } catch (error: any) {
      this.errorMessage = this.getErrorMessage(error.code);
    }
  }

  async recoverPassword() {
    if (!this.email) return;
    this.errorMessage = '';
    this.successMessage = '';
    try {
      await this.authService.resetPassword(this.email);
      this.successMessage = 'Email di recupero inviata. Controlla la tua casella.';
      this.isRecoveringPassword = false;
    } catch (error: any) {
      this.errorMessage = this.getErrorMessage(error.code);
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
