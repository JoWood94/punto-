import { Injectable, inject, Injector, runInInjectionContext } from '@angular/core';
import { Messaging, getToken, onMessage } from '@angular/fire/messaging';
import { getFirestore, doc, setDoc, arrayUnion } from 'firebase/firestore';
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
        
        const token = await runInInjectionContext(this.injector, () => getToken(this.messaging, {
          vapidKey: environment.firebase.vapidKey,
          serviceWorkerRegistration: registration
        }));
        console.log('Firebase Cloud Messaging Token:', token);
        
        const uid = this.authService.getCurrentUserId();
        if (uid && token) {
           const userRef = doc(this.db, `users/${uid}`);
           await setDoc(userRef, { fcmTokens: arrayUnion(token) }, { merge: true });
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
        if (Notification.permission === 'granted') {
          // Legge da payload.data (data-only message)
          const title = (payload.data?.['title'] as string) || 'Promemoria da punto!';
          const body = (payload.data?.['body'] as string) || '';
          new Notification(title, {
            body,
            icon: 'icons/icon-192x192.png'
          });
        }
      });
    });
  }
}
