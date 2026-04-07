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

// Deep link: apre la nota giusta al click della notifica su mobile e desktop.
// capture:true → gira nella fase di cattura, PRIMA dell'handler interno dell'SDK FCM.
// stopImmediatePropagation impedisce che l'SDK apra fcm_options.link in parallelo.
self.addEventListener('notificationclick', (event) => {
  event.stopImmediatePropagation();
  event.notification.close();

  const noteId = event.notification.data?.noteId || event.notification.tag;
  const appOrigin = self.location.origin;
  // Ricava il basePath dal percorso del SW: '/punto-/firebase-messaging-sw.js' → '/punto-/'
  // In locale: '/firebase-messaging-sw.js' → '/' → funziona anche in dev
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
}, true); // capture:true → precede l'handler FCM SDK registrato in bubble phase
