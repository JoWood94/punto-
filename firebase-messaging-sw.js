/* eslint-disable no-undef */
importScripts("https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js");

const firebaseConfig = {
  apiKey: "AIzaSyDqf9hfsOCbZf_e3wo8lCagMoeUifJChPw",
  authDomain: "punto-84646.firebaseapp.com",
  projectId: "punto-84646",
  storageBucket: "punto-84646.firebasestorage.app",
  messagingSenderId: "606839701326",
  appId: "1:606839701326:web:62e5fb3ab9db3480c4281f"
};

firebase.initializeApp(firebaseConfig);

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('Ricevuto messaggio FCM in background: ', payload);
  // Se il messaggio contiene un campo notification, il SDK compat lo auto-visualizza:
  // non serve chiamare showNotification manualmente (evita la doppia notifica).
  if (payload.notification) return;
  // Fallback per messaggi data-only
  const notificationTitle = payload.data?.title || 'Nuovo Promemoria da punto!';
  const notificationOptions = {
    body: payload.data?.body || '',
    icon: 'punto_icon.png',
    data: {
      noteId: payload.data?.noteId || null
    }
  };
  self.registration.showNotification(notificationTitle, notificationOptions);
});

// Deep link: apre la nota giusta al click della notifica su mobile e desktop
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const noteId = event.notification.data?.noteId;
  const appOrigin = self.location.origin;
  const basePath = self.location.pathname.replace(/\/firebase-messaging-sw\.js$/, '/');
  const targetUrl = noteId
    ? `${appOrigin}${basePath}?openNote=${encodeURIComponent(noteId)}`
    : `${appOrigin}${basePath}`;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Se l'app è già aperta: manda un messaggio e porta la finestra in primo piano
      for (const client of clientList) {
        if (client.url.startsWith(appOrigin) && 'focus' in client) {
          if (noteId) {
            client.postMessage({ type: 'OPEN_NOTE', noteId });
          }
          return client.focus();
        }
      }
      // App chiusa: apri una nuova finestra all'URL corretto
      return clients.openWindow(targetUrl);
    })
  );
});
