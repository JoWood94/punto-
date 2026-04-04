<!-- task inviato: 2026-04-04T15:11:23.857Z | task-id: BF-60-fcm-token-stale -->
task-id: BF-60-fcm-token-stale
state-file: agents/state/BF-60-fcm-token-stale.md

status: in_progress
agent: alpha
task: Fix FCM token stale/non-rigenerato dopo login

## Problema
- FCM invalida push subscription nel SW quando i token sono scaduti (60+ giorni, cambio device, etc.)
- Il codice attuale chiama `getToken()` senza mai chiamare `deleteToken()` prima
- Se la subscription sottostante è invalida, `getToken()` fallisce silenziosamente (errore caught, ritorna null)
- Risultato: nessun token scritto in Firestore → notifiche non arrivano

## Fix richiesto

In `frontend/src/app/services/push-notification.ts`, nella funzione `requestPermission()`:

**Prima** di chiamare `getToken(...)`, aggiungere un tentativo di `deleteToken()` per pulire la subscription stale dal SW:

```ts
import { Messaging, getToken, deleteToken, onMessage } from '@angular/fire/messaging';
```

Nel blocco dopo `const registration = await navigator.serviceWorker.register(swUrl)`:

```ts
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
```

Questo garantisce che ogni volta che l'utente apre l'app (login o reload), la subscription FCM sia fresca e il token sia valido.

## File da modificare
- `frontend/src/app/services/push-notification.ts`

## Note
- `deleteToken()` è idempotente: se non c'è token, ritorna false senza errori (ma wrappato nel try/catch per sicurezza)
- Il costo aggiuntivo è minimo: una chiamata FCM al login/refresh
- Non toccare il resto della logica (arrayUnion, cleanup >5 token, ecc.)

