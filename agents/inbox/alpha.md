<!-- task inviato: 2026-04-04T15:34:47.634Z | task-id: BF-62-push-token-retry -->
task-id: BF-62-push-token-retry
state-file: agents/state/BF-62-push-token-retry.md

status: in_progress
agent: alpha
task: Fix strategia registrazione FCM token — deleteToken solo come fallback

## Problema con BF-60
`deleteToken()` viene chiamato ad ogni login prima di `getToken()`. Su Brave (e altri browser con blocco FCM), `deleteToken()` fallisce silenziosamente, poi `getToken()` fallisce con AbortError → nessun token registrato.

## Fix richiesto
In `frontend/src/app/services/push-notification.ts`, cambia la strategia:
- Rimuovere il blocco `deleteToken()` che precede `getToken()`
- Prima prova `getToken()` direttamente
- Se fallisce, allora prova il ciclo `deleteToken()` → `getToken()` come fallback

```ts
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
```

Sostituisce il blocco attuale (deleteToken sempre + getToken) con questo pattern try→fallback.

## File
- `frontend/src/app/services/push-notification.ts`

