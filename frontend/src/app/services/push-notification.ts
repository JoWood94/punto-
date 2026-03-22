import { Injectable, inject } from '@angular/core';
import { Messaging, getToken, onMessage } from '@angular/fire/messaging';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class PushNotificationService {
  private messaging = inject(Messaging);

  async requestPermission(): Promise<string | null> {
    try {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        const token = await getToken(this.messaging, {
          vapidKey: environment.firebase.vapidKey 
        });
        console.log('Firebase Cloud Messaging Token:', token);
        return token;
      } else {
        console.warn('Push Notification permission denied. Le notifiche sono disabilitate.');
        return null;
      }
    } catch (err) {
      console.error('Error getting push token. Probabilmente mancano le credenziali vere su environments.ts:', err);
      return null;
    }
  }

  listenForMessages() {
    onMessage(this.messaging, (payload) => {
      console.log('Push Message received in foreground. ', payload);
      if (Notification.permission === 'granted') {
         new Notification(payload.notification?.title || 'Promemoria da punto!', {
            body: payload.notification?.body,
            icon: '/icons/icon-192x192.png'
         });
      }
    });
  }
}
