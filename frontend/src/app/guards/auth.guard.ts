import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Auth, onAuthStateChanged } from '@angular/fire/auth';
import { from } from 'rxjs';

export const authGuard: CanActivateFn = (route, state) => {
  const auth = inject(Auth);
  const router = inject(Router);

  // Usa una Promise one-shot su onAuthStateChanged per aspettare che Firebase Auth
  // completi l'inizializzazione della sessione (IndexedDB/persistence) prima di decidere.
  // take(1) su authState() può catturare un null "pre-init" e causare un redirect errato.
  return from(
    new Promise<boolean>(resolve => {
      const unsub = onAuthStateChanged(auth, user => {
        unsub();
        if (!user) {
          router.navigate(['/login'], { queryParams: { returnUrl: state.url } });
          resolve(false);
          return;
        }
        const isEmailProvider = user.providerData.some(p => p.providerId === 'password');
        if (isEmailProvider && !user.emailVerified) {
          router.navigate(['/login'], { queryParams: { returnUrl: state.url } });
          resolve(false);
          return;
        }
        resolve(true);
      });
    })
  );
};
