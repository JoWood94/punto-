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
  
  private authService = inject(AuthService);
  private router = inject(Router);

  async onSubmit() {
    if (!this.email || !this.password) return;
    try {
      if (this.isRegistering) {
        if (this.password !== this.confirmPassword) return;
        await this.authService.register(this.email, this.password);
      } else {
        await this.authService.login(this.email, this.password);
      }
      this.router.navigate(['/dashboard'], { replaceUrl: true });
    } catch (error: any) {
      console.error(error.message);
    }
  }

  async recoverPassword() {
    if (!this.email) return;
    try {
      await this.authService.resetPassword(this.email);
      this.isRecoveringPassword = false;
    } catch (error: any) {
      console.error(error.message);
    }
  }

  async loginWithApple() {
    try {
      await this.authService.loginWithApple();
      this.router.navigate(['/dashboard'], { replaceUrl: true });
    } catch (error: any) {
      console.error(error.message);
    }
  }
}
