status: done
agent: alpha
task: Fix deep link iOS — navigation queue via Cache API per PWA deep sleep

## Problema

Su iOS, la PWA viene messa in deep sleep in pochi secondi. Quando l'utente tappa una notifica:
1. iOS risveglia il processo PWA da zero
2. Angular non è ancora montato → `swMessageListener` non esiste
3. Il `postMessage` del SW viene perso
4. `?openNote=` nell'URL può essere perso se iOS riapre la PWA sull'URL di default

## Soluzione — Navigation Queue via Cache API

Il SW scrive il `noteId` nella Cache API **prima** di qualsiasi altra operazione. L'app legge la coda come prima cosa in `ngOnInit`, indipendentemente da come è stata risvegliata.

---

## Fix 1 — `frontend/public/firebase-messaging-sw.js`

Sostituire l'intero handler `notificationclick` con:

```javascript
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const noteId = event.notification.data?.noteId;
  const appOrigin = self.location.origin;
  const swPath = self.location.pathname;
  const basePath = swPath.substring(0, swPath.lastIndexOf('/') + 1);
  const targetUrl = noteId
    ? `${appOrigin}${basePath}dashboard?openNote=${encodeURIComponent(noteId)}`
    : `${appOrigin}${basePath}dashboard`;

  event.waitUntil((async () => {
    // 1. Scrivi in navigation queue (sopravvive al deep sleep iOS)
    //    Cache API è accessibile sia dal SW che dall'app Angular.
    if (noteId) {
      try {
        const cache = await caches.open('punto-nav-queue');
        await cache.put(
          new Request('pending-nav'),
          new Response(JSON.stringify({ noteId, ts: Date.now() }))
        );
      } catch (e) {
        console.warn('[SW] Nav queue write failed:', e);
      }
    }

    // 2. Cerca client attivo e notifica via postMessage (best effort — app già aperta)
    const clientList = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clientList) {
      if (client.url.includes('/dashboard')) {
        if (noteId) client.postMessage({ type: 'OPEN_NOTE', noteId });
        return client.focus();
      }
    }

    // 3. App chiusa/dormiente: apri/risveglia con URL corretto
    return clients.openWindow(targetUrl);
  })());
});
```

---

## Fix 2 — `frontend/src/app/components/dashboard/dashboard.ts`

### Aggiungere metodo privato `checkNavigationQueue()`

```typescript
private async checkNavigationQueue(): Promise<string | null> {
  if (!('caches' in window)) return null;
  try {
    const cache = await caches.open('punto-nav-queue');
    const res = await cache.match('pending-nav');
    if (!res) return null;
    const data = await res.json();
    await cache.delete('pending-nav');
    // Ignora voci più vecchie di 5 minuti (navigazione stantia)
    if (Date.now() - data.ts > 5 * 60 * 1000) return null;
    return data.noteId ?? null;
  } catch {
    return null;
  }
}
```

### In `ngOnInit()` — sostituire la riga di lettura deepLink

Prima:
```typescript
const urlParams = new URLSearchParams(window.location.search);
this.deepLinkNoteId = urlParams.get('openNote');
```

Dopo:
```typescript
const urlParams = new URLSearchParams(window.location.search);
this.deepLinkNoteId = urlParams.get('openNote') || await this.checkNavigationQueue();
```

---

## Note implementative
- `caches` è disponibile in tutti i browser moderni che supportano SW (Safari iOS 11.1+)
- La cache `punto-nav-queue` è leggera: contiene al massimo 1 entry
- Il TTL di 5 minuti evita che navigazioni vecchie si attivino alla prossima apertura dell'app
- `postMessage` e `openWindow` rimangono come best-effort per i casi in cui l'app è già attiva

## Output atteso
- Fix in `firebase-messaging-sw.js` e `dashboard.ts`
- Build production OK
- Aggiorna questo file con `status: done` e `completed:`

## ⛔ NO deploy — attendo validazione Giuseppe in locale
completed: SW scrive noteId in Cache API 'punto-nav-queue' prima di postMessage/openWindow. dashboard.ts: aggiunto checkNavigationQueue() con TTL 5min; ngOnInit legge ?openNote || cache queue.
