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
        // Determine the correct service worker path based on base href
        const baseHref = document.querySelector('base')?.getAttribute('href') || '/';
        const swUrl = `${baseHref}firebase-messaging-sw.js`;
        
        // Register the service worker at the correct path
        const registration = await navigator.serviceWorker.register(swUrl);
        console.log('[Push] Service worker registered at:', swUrl);
        
        // Forza rigenerazione del token: pulisce subscription stale dal SW
        // prima di richiedere un nuovo token a FCM.
        try {
          await runInInjectionContext(this.injector, () => deleteToken(this.messaging));
        } catch {
          // Ignora se non c'era token da cancellare
        }

        const token = await runInInjectionContext(this.injector, () => getToken(this.messaging, {
          vapidKey: environment.firebase.vapidKey,
          serviceWorkerRegistration: registration
        }));
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
      console.error('Error getting push token:', err);
      if (err.name === 'AbortError') {
        console.warn('Push registration failed. Suggerimento: Se usi Brave, disabilita gli "Shields" o controlla le impostazioni di Privacy per consentire il servizio di push di Google.');
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
