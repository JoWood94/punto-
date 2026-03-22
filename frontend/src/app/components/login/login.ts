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
  isRegistering = false;
  
  private authService = inject(AuthService);
  private router = inject(Router);
  private snackBar = inject(MatSnackBar);

  async onSubmit() {
    if (!this.email || !this.password) return;
    try {
      if (this.isRegistering) {
        await this.authService.register(this.email, this.password);
        this.snackBar.open('Registrazione completata! Accesso in corso...', 'Chiudi', { duration: 3000 });
      } else {
        await this.authService.login(this.email, this.password);
      }
      this.router.navigate(['/dashboard']);
    } catch (error: any) {
      this.snackBar.open(error.message, 'Chiudi', { duration: 5000 });
    }
  }
}
