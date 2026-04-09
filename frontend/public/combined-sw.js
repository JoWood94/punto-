/* eslint-disable no-undef */
// Combined Service Worker: Firebase Messaging + Angular NGSW
// Unico SW registrato per lo scope /punto-/ — elimina il conflitto tra i due SW.

// ── 1. Firebase Messaging ──────────────────────────────────────────────────
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

// ── 2. Deep link handler ───────────────────────────────────────────────────
// capture:true → precede l'handler FCM SDK (bubble phase).
// stopImmediatePropagation impedisce aperture doppie.
self.addEventListener('notificationclick', (event) => {
  event.stopImmediatePropagation();
  event.notification.close();

  const noteId = event.notification.data?.noteId || event.notification.tag;
  const appOrigin = self.location.origin;
  // Ricava il basePath dal percorso del SW: '/punto-/combined-sw.js' → '/punto-/'
  const swPath = self.location.pathname;
  const basePath = swPath.substring(0, swPath.lastIndexOf('/') + 1);
  const targetUrl = noteId
    ? `${appOrigin}${basePath}dashboard?openNote=${encodeURIComponent(noteId)}`
    : `${appOrigin}${basePath}dashboard`;

  event.waitUntil((async () => {
    // 1. Nav queue: sopravvive al deep sleep iOS
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

    // 2. App già aperta: postMessage al client dashboard
    const clientList = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clientList) {
      if (client.url.includes('/dashboard')) {
        if (noteId) client.postMessage({ type: 'OPEN_NOTE', noteId });
        return client.focus();
      }
    }

    // 3. App chiusa/dormiente: apri con URL corretto
    return clients.openWindow(targetUrl);
  })());
}, true);

// ── 3. Angular NGSW ────────────────────────────────────────────────────────
// Importato per ultimo: gestisce fetch caching Angular.
// Firebase (sopra) gestisce push; NGSW gestisce il resto.
importScripts('./ngsw-worker.js');
