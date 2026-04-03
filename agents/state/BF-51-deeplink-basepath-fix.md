status: done
agent: alpha
task: Fix deep link notifica — base path errato + client.navigate() → postMessage

## Problema

Due bug in `frontend/public/firebase-messaging-sw.js` nel handler `notificationclick`.

### Bug 1 — URL senza base href (causa principale)

Il SW costruisce `targetUrl` usando solo `self.location.origin`:
```javascript
const targetUrl = `${appOrigin}/dashboard?openNote=...`
// Produce in prod: https://giuseppebosco.github.io/dashboard  ← SBAGLIATO
// Corretto:        https://giuseppebosco.github.io/punto-/dashboard
```

L'app è deployata con `--base-href /punto-/` ma il SW non la include → sia `openWindow()` che `navigate()` puntano all'URL sbagliato in produzione.

### Bug 2 — `client.navigate()` inaffidabile

Quando la tab è già aperta, il SW usa `client.navigate(targetUrl)` che:
- Causa un full page reload perdendo lo stato
- Non è affidabile su iOS PWA
- Il dashboard ha già un `swMessageListener` che gestisce `{ type: 'OPEN_NOTE', noteId }` — è la strada corretta

## Fix in `firebase-messaging-sw.js`

Sostituire il blocco `event.waitUntil(...)` nel `notificationclick` handler con:

```javascript
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const noteId = event.notification.data?.noteId;
  const appOrigin = self.location.origin;
  // Ricava il basePath dal percorso del SW: '/punto-/firebase-messaging-sw.js' → '/punto-/'
  // In locale: '/firebase-messaging-sw.js' → '/' → funziona anche in dev
  const swPath = self.location.pathname;
  const basePath = swPath.substring(0, swPath.lastIndexOf('/') + 1);
  const targetUrl = noteId
    ? `${appOrigin}${basePath}dashboard?openNote=${encodeURIComponent(noteId)}`
    : `${appOrigin}${basePath}dashboard`;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes('/dashboard')) {
          // App già aperta: postMessage → swMessageListener in dashboard apre la nota
          // senza page reload. Più affidabile di client.navigate() su iOS.
          if (noteId) client.postMessage({ type: 'OPEN_NOTE', noteId });
          return client.focus();
        }
      }
      // App chiusa: apri nuova finestra con URL corretto (base href incluso)
      return clients.openWindow(targetUrl);
    })
  );
});
```

## Verifica
- Build production OK
- Testa in locale: notifica push → click → apre dashboard sulla nota corretta
- Verifica che `basePath` ricavato sia `/punto-/` nel build produzione

## ⛔ NO deploy — attendo validazione Giuseppe in locale
completed: firebase-messaging-sw.js: basePath ricavato da self.location.pathname; client.navigate() sostituito con postMessage({ type: 'OPEN_NOTE', noteId }) + client.focus().
bloccato_da:
