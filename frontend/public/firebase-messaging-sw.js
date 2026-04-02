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
  // Mostriamo SEMPRE la notifica manualmente: quando onBackgroundMessage è registrato,
  // il SDK compat non auto-visualizza — siamo noi responsabili di showNotification.
  // Usare payload.data?.noteId (da webpush.data) garantisce che noteId sia sempre
  // disponibile nel notificationclick handler per il deep link.
  const noteId = payload.data?.noteId || null;
  const notificationTitle = payload.notification?.title || payload.data?.title || 'Nuovo Promemoria da punto!';
  const notificationOptions = {
    body: payload.notification?.body || payload.data?.body || '',
    icon: 'punto_icon.png',
    data: { noteId }
  };
  self.registration.showNotification(notificationTitle, notificationOptions);
});

// Deep link: apre la nota giusta al click della notifica su mobile e desktop
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const noteId = event.notification.data?.noteId;
  const appOrigin = self.location.origin;
  // Naviga direttamente a /dashboard per evitare che il redirect '' → dashboard
  // di Angular perda i query params
  const targetUrl = noteId
    ? `${appOrigin}/dashboard?openNote=${encodeURIComponent(noteId)}`
    : `${appOrigin}/dashboard`;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes('/dashboard')) {
          // navigate() ricarica l'URL con i query params → dashboard li legge all'init
          // Più affidabile di postMessage su iOS (il listener potrebbe non essere ancora montato)
          return client.navigate(targetUrl).then(c => c ? c.focus() : null);
        }
      }
      // App chiusa: apri nuova finestra
      return clients.openWindow(targetUrl);
    })
  );
});
