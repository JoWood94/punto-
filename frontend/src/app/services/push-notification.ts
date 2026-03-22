import { Injectable, inject, Injector, runInInjectionContext } from '@angular/core';
import { Messaging, getToken, onMessage } from '@angular/fire/messaging';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class PushNotificationService {
  private messaging = inject(Messaging);
  private injector = inject(Injector);

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
        return token;
      } else {
        console.warn('Push Notification permission denied. Le notifiche sono disabilitate.');
        return null;
      }
    } catch (err) {
      console.error('Error getting push token:', err);
      return null;
    }
  }

  listenForMessages() {
    onMessage(this.messaging, (payload) => {
      console.log('Push Message received in foreground. ', payload);
      if (Notification.permission === 'granted') {
         new Notification(payload.notification?.title || 'Promemoria da punto!', {
            body: payload.notification?.body,
            icon: 'icons/icon-192x192.png'
         });
      }
    });
  }
}
