import { Injectable, inject, Injector, runInInjectionContext } from '@angular/core';
import { Messaging, getToken, deleteToken, onMessage } from '@angular/fire/messaging';
import { getFirestore, doc, setDoc, updateDoc, arrayRemove } from 'firebase/firestore';
import { getApp, getApps, initializeApp } from 'firebase/app';
import { AuthService } from './auth';
import { environment } from '../../environments/environment';

const DEVICE_ID_KEY = 'punto_device_id';

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

  private getOrCreateDeviceId(): string {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  }

  async requestPermission(): Promise<string | null> {
    console.log('[Push] requestPermission start');
    if (typeof Notification === 'undefined') {
      console.warn('[Push] Notification API non supportata in questo browser');
      return null;
    }
    if (!('serviceWorker' in navigator)) {
      console.warn('[Push] serviceWorker non disponibile');
      return null;
    }
    try {
      const permission = await Notification.requestPermission();
      console.log('[Push] permission =', permission);
      if (permission === 'granted') {
        // Ensure the service worker is registered (idempotent — Angular provideServiceWorker
        // handles this, but we call it explicitly to guarantee the correct path on both
        // production /punto-/ and staging / base hrefs).
        const baseHref = document.querySelector('base')?.getAttribute('href') || '/';
        const swUrl = `${baseHref}combined-sw.js`;
        console.log('[Push] registering SW at', swUrl);
        await navigator.serviceWorker.register(swUrl);

        // Wait for an active SW before requesting the push token.
        // Calling getToken() while the SW is still in installing/waiting state triggers
        // AbortError: Registration failed - push service error from the browser Push API.
        const registration = await navigator.serviceWorker.ready;
        console.log('[Push] SW ready, requesting FCM token');

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
        const deviceId = this.getOrCreateDeviceId();
        console.log('[Push] uid:', uid, 'deviceId:', deviceId, 'token len:', token?.length ?? 0);
        if (uid && token) {
          const userRef = doc(this.db, `users/${uid}`);
          // Un device = un token: sovrascrive sempre la entry di questo dispositivo.
          // Niente duplicati anche su reinstall PWA o refresh token.
          await setDoc(userRef, { fcmDevices: { [deviceId]: token } }, { merge: true });
          // Migrazione: rimuove questo token dall'array legacy fcmTokens (se presente).
          // Chirurgico: rimuove solo il token di questo device, non tocca gli altri.
          await updateDoc(userRef, { fcmTokens: arrayRemove(token) }).catch(() => {});
          console.log('[Push] FCM token saved to fcmDevices for deviceId', deviceId);
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
