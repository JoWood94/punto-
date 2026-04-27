import { Injectable, inject, Injector, runInInjectionContext } from '@angular/core';
import { Messaging, getToken, deleteToken, onMessage } from '@angular/fire/messaging';
import { getFirestore, doc, getDoc, setDoc, updateDoc, deleteField, arrayRemove } from 'firebase/firestore';
import { getApp, getApps, initializeApp } from 'firebase/app';
import { AuthService } from './auth';
import { environment } from '../../environments/environment';

/** Chiave fcmDevices: `${platform}-${maxDim}x${minDim}` — risoluzione fisica come
 *  identificatore stabile del device (sopravvive a reinstall PWA, OS update, browser update).
 *  Le chiavi che non matchano questo pattern sono orphan da schema legacy (random UUID). */
const PLATFORM_KEY_RE = /^(ios|android|desktop)-\d+x\d+$/;

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

  /** Identifica univocamente questo device tramite (platform, risoluzione fisica).
   *  La risoluzione `screen.width/height` è stabile attraverso reinstall PWA, OS update
   *  e browser update — a differenza di UUID in localStorage (wipeato a reinstall su iOS)
   *  o userAgent (cambia a ogni aggiornamento). */
  private getDeviceKey(): { key: string; label: string; platform: string } {
    const ua = navigator.userAgent;
    const platform = /iPhone|iPad|iPod/.test(ua) ? 'ios'
      : /Android/.test(ua) ? 'android'
      : 'desktop';
    const w = Math.max(screen.width || 0, screen.height || 0);
    const h = Math.min(screen.width || 0, screen.height || 0);
    const key = `${platform}-${w}x${h}`;
    const friendlyName = platform === 'ios'
      ? (/iPad/.test(ua) ? 'iPad' : 'iPhone')
      : platform === 'android' ? 'Android'
      : 'Desktop';
    const label = `${friendlyName} ${w}×${h}`;
    return { key, label, platform };
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
        const { key: deviceKey, label } = this.getDeviceKey();
        console.log('[Push] uid:', uid, 'deviceKey:', deviceKey, 'token len:', token?.length ?? 0);
        if (uid && token) {
          const userRef = doc(this.db, `users/${uid}`);
          const entry = {
            token,
            label,
            userAgent: navigator.userAgent,
            lastSeen: Date.now(),
          };
          // Scrive la entry per questa chiave (crea il doc se non esiste).
          await setDoc(userRef, { fcmDevices: { [deviceKey]: entry } }, { merge: true });

          // Cleanup orphan: rimuove entry con chiavi che non matchano il pattern attuale
          // (random UUID dal vecchio schema). Preserva entry di altri platform-key validi
          // (es. desktop dell'utente se sto registrando da iOS).
          try {
            const userSnap = await getDoc(userRef);
            const current = userSnap.data()?.['fcmDevices'] ?? {};
            const cleanup: Record<string, any> = {};
            for (const oldKey of Object.keys(current)) {
              if (oldKey !== deviceKey && !PLATFORM_KEY_RE.test(oldKey)) {
                cleanup[`fcmDevices.${oldKey}`] = deleteField();
              }
            }
            if (Object.keys(cleanup).length > 0) {
              await updateDoc(userRef, cleanup);
              console.log('[Push] Cleanup orphan keys:', Object.keys(cleanup).length);
            }
          } catch (e) {
            console.warn('[Push] orphan cleanup skipped:', e);
          }

          // Migrazione legacy: rimuove questo token dall'array fcmTokens se presente.
          await updateDoc(userRef, { fcmTokens: arrayRemove(token) }).catch(() => {});
          console.log('[Push] FCM token saved to fcmDevices for', deviceKey);
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
