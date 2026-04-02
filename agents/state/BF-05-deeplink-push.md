status: done
agent: alpha
task: Bug deep link notifica push → apertura nota non funziona
completed:
  Bug: onBackgroundMessage faceva early return quando payload.notification era presente,
  delegando all'SDK compat l'auto-visualizzazione — ma il SDK compat NON auto-visualizza
  quando onBackgroundMessage è registrato. Quindi la notifica veniva mostrata senza
  data.noteId → notificationclick non poteva estrarre il noteId → deep link falliva.

  Fix (firebase-messaging-sw.js): rimosso il blocco `if (payload.notification) return`.
  Ora showNotification è sempre chiamato manualmente, con noteId preso da
  payload.data?.noteId (webpush.data, sempre disponibile) e titolo/body da
  payload.notification o payload.data come fallback.

  Verificato: server/index.js già invia noteId in webpush.data e webpush.notification.data. ✓
  Verificato: basePath in notificationclick → /punto-/ corretto. ✓
  Verificato: dashboard.ts legge ?openNote= prima del replaceState. ✓
