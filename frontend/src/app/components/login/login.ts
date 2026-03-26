import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, MatCardModule, MatFormFieldModule, MatInputModule, MatButtonModule, MatIconModule, MatSnackBarModule],
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
  
  private authService = inject(AuthService);
  private router = inject(Router);
  private snackBar = inject(MatSnackBar);

  async onSubmit() {
    if (!this.email || !this.password) return;
    try {
      if (this.isRegistering) {
        if (this.password !== this.confirmPassword) {
          this.snackBar.open('Le password non coincidono!', 'Chiudi', { duration: 4000 });
          return;
        }
        await this.authService.register(this.email, this.password);
        this.snackBar.open('Registrazione completata! Accesso in corso...', 'Chiudi', { duration: 3000 });
      } else {
        await this.authService.login(this.email, this.password);
      }
      this.router.navigate(['/dashboard'], { replaceUrl: true });
    } catch (error: any) {
      this.snackBar.open(error.message, 'Chiudi', { duration: 5000 });
    }
  }

  async recoverPassword() {
    if (!this.email) {
      this.snackBar.open('Inserisci la tua email per recuperare la password', 'Chiudi', { duration: 4000 });
      return;
    }
    try {
      await this.authService.resetPassword(this.email);
      this.snackBar.open("Ti abbiamo inviato un'email per reimpostare la password. Controlla la posta in arrivo o la cartella spam", "Chiudi", {duration: 6000});
      this.isRecoveringPassword = false;
    } catch (error: any) {
      this.snackBar.open(error.message, 'Chiudi', { duration: 5000 });
    }
  }

  async loginWithApple() {
    try {
      await this.authService.loginWithApple();
      this.router.navigate(['/dashboard'], { replaceUrl: true });
    } catch (error: any) {
      this.snackBar.open(error.message, 'Chiudi', { duration: 5000 });
    }
  }
}
