<!-- task inviato: 2026-04-04T15:42:35.518Z | task-id: BF-63-push-data-only -->
task-id: BF-63-push-data-only
state-file: agents/state/BF-63-push-data-only.md

status: in_progress
agent: alpha
task: Fix notifiche promemoria non arrivano su iOS — webpush data-only non sveglia SW

## Problema
`server/index.js` manda solo `webpush.data` (no `webpush.notification`).
Su iOS PWA, i messaggi data-only non svegliano il service worker → notifica mai mostrata.
Il test script `send-notif-single-user.js` manda sia `notification` che `data` → arriva.

## Causa del design attuale
Il commento nel codice spiega: aggiungere `webpush.notification` causa duplicati perché
`firebase-messaging-sw.js` usa `onBackgroundMessage` che chiama `showNotification()` manualmente,
MA il browser mostra anche la notification nativa → 2 notifiche per 1 evento.

## Fix richiesto

**In `server/index.js`**: aggiungere `webpush.notification` al payload (come in `send-notif-single-user.js`):

```js
webpush: {
  notification: {
    title: msgTitle,
    body: bodyText,
    icon: '/icons/icon-192x192.png'
  },
  data: {
    title: msgTitle,
    body: bodyText,
    noteId: doc.id,
  }
}
```

**In `frontend/src/app/public/firebase-messaging-sw.js`**: rimuovere o condizionare `onBackgroundMessage` per evitare il duplicato. Con `notification` nel payload, Firebase Messaging SDK compat chiama onBackgroundMessage E mostra la notifica nativa → duplicato.

La soluzione: rimuovere `onBackgroundMessage` dal SW e lasciare che FCM mostri la notifica nativa dal payload `notification`. Il `notificationclick` handler rimane invariato per gestire il deep link.

```js
// RIMUOVERE questo blocco:
messaging.onBackgroundMessage((payload) => {
  // ...
  self.registration.showNotification(...);
});
```

Il `notificationclick` handler rimane — gestisce il click sulla notifica nativa.

## File da modificare
- `server/index.js`
- `frontend/src/app/public/firebase-messaging-sw.js` (SOLO questo file — non altri in frontend)

## Verifica
Dopo il fix, la notifica arriva una volta sola su tutti i dispositivi (iOS + Chrome/Brave).

