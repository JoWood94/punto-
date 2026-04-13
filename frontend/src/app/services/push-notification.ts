import { Injectable, inject, Injector, runInInjectionContext } from '@angular/core';
import { Messaging, getToken, deleteToken, onMessage } from '@angular/fire/messaging';
import { getFirestore, doc, setDoc, getDoc, arrayUnion } from 'firebase/firestore';
import { getApp, getApps, initializeApp } from 'firebase/app';
import { AuthService } from './auth';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class PushNotificationService {
  private messaging = inject(Messaging);
  private injector = inject(Injector);
  private authService = inject(AuthService);

  private get db() {
    const app = getApps().length ? getApp() : initializeApp(environment.firebase);
    return getFirestore(app);
  }

  async requestPermission(): Promise<string | null> {
    try {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        // Ensure the service worker is registered (idempotent — Angular provideServiceWorker
        // handles this, but we call it explicitly to guarantee the correct path on both
        // production /punto-/ and staging / base hrefs).
        const baseHref = document.querySelector('base')?.getAttribute('href') || '/';
        const swUrl = `${baseHref}combined-sw.js`;
        await navigator.serviceWorker.register(swUrl);

        // Wait for an active SW before requesting the push token.
        // Calling getToken() while the SW is still in installing/waiting state triggers
        // AbortError: Registration failed - push service error from the browser Push API.
        const registration = await navigator.serviceWorker.ready;

        let token: string | null = null;

        // Tentativo 1: token cached (caso normale)
        try {
          token = await runInInjectionContext(this.injector, () => getToken(this.messaging, {
            vapidKey: environment.firebase.vapidKey,
            serviceWorkerRegistration: registration
          }));
        } catch {
          // Tentativo 2: subscription stale → forza rigenerazione
          try {
            await runInInjectionContext(this.injector, () => deleteToken(this.messaging));
          } catch {
            // nessun token da cancellare, ignora
          }
          token = await runInInjectionContext(this.injector, () => getToken(this.messaging, {
            vapidKey: environment.firebase.vapidKey,
            serviceWorkerRegistration: registration
          }));
        }
        console.log('Firebase Cloud Messaging Token:', token);
        
        const uid = this.authService.getCurrentUserId();
        if (uid && token) {
          const userRef = doc(this.db, `users/${uid}`);
          // arrayUnion è atomic: safe con scritture concorrenti da più dispositivi.
          // Aggiunge il token solo se non già presente, senza sovrascrivere l'array.
          await setDoc(userRef, { fcmTokens: arrayUnion(token) }, { merge: true });

          // Cleanup asincrono: se l'array supera 5 token, tronca i più vecchi.
          // Separato dall'arrayUnion per non introdurre race condition.
          const userSnap = await getDoc(userRef);
          if (userSnap.exists()) {
            const tokens: string[] = userSnap.data()['fcmTokens'] ?? [];
            if (tokens.length > 5) {
              await setDoc(userRef, { fcmTokens: tokens.slice(-5) }, { merge: true });
            }
          }
        }
        
        return token;
      } else {
        console.warn('Push Notification permission denied. Le notifiche sono disabilitate.');
        return null;
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        // AbortError from the browser Push API: SW not yet active or push service temporarily
        // unavailable. Non-critical: existing Firestore token (if any) remains valid.
        console.warn('[Push] Registration failed — push service error. Retry at next session.', err.message);
        if (err.message?.toLowerCase().includes('push service error')) {
          console.warn('[Push] Suggerimento: Se usi Brave, disabilita gli "Shields" o controlla le impostazioni di Privacy per consentire il servizio di push di Google.');
        }
      } else {
        console.error('[Push] Error getting push token:', err);
      }
      return null;
    }
  }

  listenForMessages() {
    runInInjectionContext(this.injector, () => {
      onMessage(this.messaging, (payload) => {
        console.log('Push Message received in foreground. ', payload);
        // Non creiamo una notifica qui: il Service Worker l'ha già mostrata.
        // Questo evita duplicati quando il messaggio arriva in foreground.
      });
    });
  }
}
