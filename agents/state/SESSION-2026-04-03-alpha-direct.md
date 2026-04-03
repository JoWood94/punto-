status: done
agent: alpha
task: Sessione diretta con Giuseppe — fix fuori dal flusso inbox formale

## Task processati via inbox (regolari)
- BF-51: SW deep link — basePath da self.location.pathname, client.navigate() → postMessage
- BF-52: Navigation queue via Cache API per iOS deep sleep
- BF-53: hasDeepLink flag — elimina flash lista note prima del deep link
- BF-55: FCM token cleanup — slice(-5)
- BF-55b: Hotfix import arrayUnion (nessuna modifica necessaria, file già pulito)
- IMPL-21: Pagina Impostazioni + menu dark + route /settings

## Fix aggiuntivi concordati direttamente con Giuseppe

### Notifiche duplicate (causa root trovata)
- **Causa**: server inviava `webpush.notification` + `webpush.data`. Il browser mostrava
  la notifica via push protocol nativo E il SW chiamava `showNotification` in
  `onBackgroundMessage` → 2 notifiche per 1 token.
- **Fix**: `server/index.js` — rimossa `webpush.notification`, tenuto solo `webpush.data`.
  Il SW rimane l'unico responsabile di mostrare la notifica.

### FCM token race condition (BF-55 revert parziale)
- **Causa**: `setDoc` con array manuale causava race condition su registrazione concorrente
  da più dispositivi → l'ultimo dispositivo sovrascriveva il token del primo → sempre 1 solo token.
- **Fix**: `push-notification.ts` — ripristinato `arrayUnion` (atomic) per l'aggiunta;
  cleanup `slice(-5)` separato e asincrono solo se array > 5.

### Settings page — raffinamenti UI
- Rimosso testo privacy warning ("leggibile da chiunque abbia accesso al database")
- Aggiunta modale di conferma (`ConfirmDialogComponent`) all'attivazione del toggle notifTitle
- Header `app-header` spostato da `dashboard.scss` a `styles.scss` (globale) +
  `--app-header-h` in `:root` → usabile da qualsiasi componente (settings incluso)

## Stato deploy
⛔ Nessun commit/push — attendo go esplicito Team Lead
