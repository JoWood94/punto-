import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth';
import { map, take } from 'rxjs';

export const authGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  return authService.user$.pipe(
    take(1),
    map(user => {
      if (!user) {
        router.navigate(['/login']);
        return false;
      }
      const isEmailProvider = user.providerData.some(p => p.providerId === 'password');
      if (isEmailProvider && !user.emailVerified) {
        router.navigate(['/login']);
        return false;
      }
      return true;
    })
  );
};
