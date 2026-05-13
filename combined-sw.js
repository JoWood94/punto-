/* eslint-disable no-undef */
// Combined Service Worker: Firebase Messaging + Angular NGSW
// Unico SW registrato per lo scope /punto-/ — elimina il conflitto tra i due SW.

// ── 0. Custom push handler (PRIMA di tutto) ────────────────────────────────
// Su iOS PWA, sia Firebase Messaging compat sia ngsw-worker.js registrano
// listener `push` che chiamano showNotification → 2 notifiche identiche per push.
// Questo handler si registra come FIRST listener, mostra la notifica e blocca
// gli altri via stopImmediatePropagation.
//
// RF-05 Fase 2: il server (server/index.js) ora invia per-token con:
//   - `notification`: title/body/icon/tag/data → fallback "Promemoria" se cifrato
//   - `data`: { noteId, type, fallbackTitle, body, isEncrypted,
//       recipientUid, encryptedTitle? (AESN1:iv:ct), ciphertext? (legacy compat) }
// Il SW legge la notification-key da IDB `punto-crypto-worker/keys/{recipientUid}`
// (stessa origin del crypto.worker dedicato, scritta dal worker al primo unlock)
// e decifra `data.encryptedTitle` con WebCrypto AES-GCM. Zero OpenPGP.js qui.
self.addEventListener('push', (event) => {
  event.stopImmediatePropagation();
  console.log('[SW][Push] event received, has data:', !!event.data, 'ts:', new Date().toISOString());
  if (!event.data) {
    console.log('[SW][Push] SKIP: no data');
    return;
  }
  let payload;
  try {
    payload = event.data.json();
  } catch (e) {
    console.warn('[SW][Push] parse error:', e && e.message);
    return;
  }

  const notif = payload.notification;
  const data = payload.data || (notif && notif.data) || {};

  console.log('[SW][Push] payload.notification present:', !!notif,
    'notification.title:', notif && notif.title);
  console.log('[SW][Push] payload type=', data && data.type, 'noteId=', data && data.noteId,
    'recipientUid=', data && data.recipientUid,
    'hasEncryptedTitle=', !!(data && data.encryptedTitle),
    'isEncrypted=', data && data.isEncrypted,
    'fallbackTitle=', data && data.fallbackTitle);
  console.log('[SW][Push] full data keys:', Object.keys(data || {}));

  // Costruzione opzioni notifica unificata (compat con e senza `notification`).
  const buildOptions = (title) => ({
    body: (notif && notif.body) || data.body || '',
    icon: (notif && notif.icon) || '/icons/icon-192x192.png',
    badge: '/icons/icon-192x192.png',
    tag: (notif && notif.tag)
      || (data.noteId ? `${data.type || 'note'}-${data.noteId}` : undefined),
    data: {
      noteId: data.noteId || (notif && notif.data && notif.data.noteId),
      type: data.type,
      kind: (notif && notif.data && notif.data.kind) || data.kind
    }
  });

  // Fallback-safe: se decryption fallisce o non c'è encryptedTitle, mostra
  // notification.title (già fallback "Promemoria" lato server per nota cifrata).
  const fallbackTitle = (notif && notif.title)
    || data.fallbackTitle
    || 'punto!';

  event.waitUntil((async () => {
    let title = fallbackTitle;
    let usedDecrypt = false;

    // RF-05 Fase 2: tenta decrypt se il server ha incluso encryptedTitle E
    // conosciamo il recipientUid. Niente fallback su `data.ciphertext` (PGP/AES
    // shared) nel SW: troppo pesante e/o richiede chiavi non disponibili qui.
    if (data.isEncrypted === '1' && data.encryptedTitle && data.recipientUid) {
      console.log('[SW][Decrypt] attempting on length:', data.encryptedTitle.length,
        'recipientUid:', data.recipientUid);
      try {
        const decrypted = await decryptTitleInSW(data.encryptedTitle, data.recipientUid);
        if (decrypted) {
          console.log('[SW][Decrypt] SUCCESS title length:', decrypted.length);
          title = decrypted;
          usedDecrypt = true;
        } else {
          console.log('[SW][Decrypt] returned NULL → using fallback title:', fallbackTitle);
        }
      } catch (err) {
        // fallback silenzioso: titolo fallback già impostato
        console.warn('[SW][Decrypt] EXCEPTION:', err && err.message);
      }
    } else {
      console.log('[SW][Decrypt] SKIP: no encryptedTitle/recipientUid in payload',
        '(isEncrypted=', data.isEncrypted,
        ', hasEncryptedTitle=', !!data.encryptedTitle,
        ', recipientUid=', data.recipientUid, ')');
    }

    console.log('[SW][Show] showing notification — title:', String(title).substring(0, 30),
      'usedDecrypt:', usedDecrypt, 'tag:', buildOptions(title).tag);
    try {
      await self.registration.showNotification(title, buildOptions(title));
      console.log('[SW][Show] notification shown OK');
    } catch (err) {
      console.warn('[SW][Show] showNotification FAILED:', err && err.message);
    }
  })());
}, false);

// ── 0b. SW-side title decryption (RF-05 Fase 2) ────────────────────────────
// 1. Apri IDB `punto-crypto-worker` (same origin del worker dedicato)
// 2. Leggi record keys/{recipientUid}.notificationKey (CryptoKey, non-extractable)
// 3. Verifica auto-lock 7gg via lastUnlockAt
// 4. AES-GCM decrypt del ciphertext (formato AESN1:<iv-b64>:<ct-b64>)
// 5. Return titolo plaintext, oppure null su qualunque errore (fallback sicuro)
//
// Importante: NON usiamo `id` come keyPath nel SW; il keyPath nello store
// `keys` è `uid` (vedi crypto.worker.ts). La get() su recipientUid deve
// matchare quel keyPath.
const CRYPTO_IDB_NAME = 'punto-crypto-worker';
// NOTA: il SW apre IDB SENZA version (vedi openCryptoIDB) per evitare di
// triggerare un upgrade dal SW. La versione attesa è 4 (RF-05 Fase 2.1, HKDF
// notifKey deterministica). Il valore qui è documentale.
const CRYPTO_IDB_VERSION = 4;
const CRYPTO_IDB_STORE = 'keys';
const NOTIF_AUTO_LOCK_MS = 7 * 24 * 60 * 60 * 1000;

function openCryptoIDB() {
  return new Promise((resolve, reject) => {
    // Apertura senza version: evita di fare upgrade dal SW se per qualche motivo
    // lo schema fosse più nuovo. Open without version → uses current DB version.
    const req = indexedDB.open(CRYPTO_IDB_NAME);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    // Niente onupgradeneeded: lo schema lo gestisce solo il crypto.worker.
  });
}

function idbGetByUid(db, uid) {
  return new Promise((resolve, reject) => {
    try {
      if (!db.objectStoreNames.contains(CRYPTO_IDB_STORE)) {
        resolve(null);
        return;
      }
      const tx = db.transaction(CRYPTO_IDB_STORE, 'readonly');
      const req = tx.objectStore(CRYPTO_IDB_STORE).get(uid);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    } catch (err) {
      reject(err);
    }
  });
}

function base64ToArrayBuffer(b64) {
  // base64 standard (non url-safe). Il worker emette `btoa(...)` puro.
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function decryptTitleInSW(encryptedTitle, recipientUid) {
  console.log('[SW][Decrypt][Step1] encryptedTitle starts with:',
    encryptedTitle && encryptedTitle.substring(0, 10),
    'len:', encryptedTitle && encryptedTitle.length);
  console.log('[SW][Decrypt][Step1] recipientUid from payload:', recipientUid);

  if (!encryptedTitle || !encryptedTitle.startsWith('AESN1:')) {
    console.log('[SW][Decrypt] SKIP: missing or invalid AESN1 marker');
    return null;
  }
  if (!recipientUid) {
    console.log('[SW][Decrypt] SKIP: missing recipientUid');
    return null;
  }

  // Format: AESN1:<iv-b64>:<ct-b64>
  const rest = encryptedTitle.slice('AESN1:'.length);
  const sepIdx = rest.indexOf(':');
  if (sepIdx === -1) {
    console.log('[SW][Decrypt] SKIP: malformed AESN1 (no separator)');
    return null;
  }
  const ivB64 = rest.slice(0, sepIdx);
  const ctB64 = rest.slice(sepIdx + 1);
  console.log('[SW][Decrypt][Step5] iv b64 length:', ivB64.length, 'ct b64 length:', ctB64.length);

  console.log('[SW][Decrypt][Step2] opening IDB...');
  let db;
  try {
    db = await openCryptoIDB();
  } catch (err) {
    console.warn('[SW][Decrypt][Step2] openCryptoIDB failed:', err && err.message);
    return null;
  }
  console.log('[SW][Decrypt][Step2] IDB opened — version:', db.version,
    'objectStoreNames:', Array.from(db.objectStoreNames));

  console.log('[SW][Decrypt][Step3] reading record for uid:', recipientUid);
  let record;
  try {
    record = await idbGetByUid(db, recipientUid);
  } catch (err) {
    console.warn('[SW][Decrypt][Step3] idbGet failed:', err && err.message);
    try { db.close(); } catch (_) { /* noop */ }
    return null;
  }
  try { db.close(); } catch (_) { /* noop */ }

  console.log('[SW][Decrypt][Step3] record found:', !!record,
    'hasNotifKey:', !!(record && record.notificationKey),
    'lastUnlockAt:', record && record.lastUnlockAt,
    'recordKeys:', record ? Object.keys(record) : []);

  if (!record) {
    console.log('[SW][Decrypt] FAIL: no record in IDB for uid=', recipientUid,
      '— user has not unlocked the crypto worker yet on this device');
    return null;
  }
  if (!record.notificationKey) {
    console.log('[SW][Decrypt] FAIL: record present but no notificationKey for uid=', recipientUid,
      '— RF-05 Fase 2.1: post v3→v4 migration, awaiting next unlockKey() with passphrase to derive HKDF key');
    return null;
  }
  // Log diagnostico chiave: estrazione algoritmo+usages senza esfiltrare bytes
  // (la chiave è non-extractable, quindi solo metadata).
  try {
    const k = record.notificationKey;
    console.log('[SW][Decrypt] notifKey loaded uid=', recipientUid,
      'extractable=', k.extractable,
      'algo=', k.algorithm && k.algorithm.name,
      'len=', k.algorithm && k.algorithm.length,
      'usages=', k.usages);
  } catch (_) { /* noop */ }

  // Auto-lock 7gg: oltre la finestra il worker dedicato cancellerà il record
  // alla prossima initFromIDB; qui non scriviamo IDB (può fallire silently).
  const now = Date.now();
  const lastUnlock = typeof record.lastUnlockAt === 'number' ? record.lastUnlockAt : 0;
  const ageMs = lastUnlock ? (now - lastUnlock) : 0;
  const ageDays = lastUnlock ? (ageMs / 86400000).toFixed(2) : 'N/A';
  console.log('[SW][Decrypt][Step4] key age:', ageDays, 'days (', ageMs, 'ms )');
  if (lastUnlock && ageMs > NOTIF_AUTO_LOCK_MS) {
    console.log('[SW][Decrypt] FAIL: 7d auto-lock expired (age=', ageDays, 'd)');
    return null;
  }

  console.log('[SW][Decrypt][Step6] calling subtle.decrypt...');
  try {
    const iv = base64ToArrayBuffer(ivB64);
    const ct = base64ToArrayBuffer(ctB64);
    console.log('[SW][Decrypt][Step6] iv bytes:', iv.byteLength, 'ct bytes:', ct.byteLength);
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      record.notificationKey,
      ct
    );
    const title = new TextDecoder().decode(decrypted);
    console.log('[SW][Decrypt][Step6] decrypt OK (HKDF cross-device), plaintext length:', title.length,
      'preview:', title.substring(0, 30));
    return title;
  } catch (err) {
    console.warn('[SW][Decrypt][Step6] subtle.decrypt FAIL:', err && err.message,
      '— possibili cause: chiave AES sbagliata (re-key dopo unlock?), iv/ct corrotti, formato AESN1 non matching');
    return null;
  }
}

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

// ── 2. Lifecycle: attivazione immediata ────────────────────────────────────
// skipWaiting: il nuovo SW si attiva senza aspettare la chiusura di tutti i tab.
// clients.claim: prende subito il controllo dei client esistenti.
self.addEventListener('install', () => {
  console.log('[SW][Lifecycle] install — calling skipWaiting');
  self.skipWaiting();
});
self.addEventListener('activate', (event) => {
  console.log('[SW][Lifecycle] activate — calling clients.claim');
  event.waitUntil(clients.claim());
});
console.log('[SW][Lifecycle] script loaded — combined-sw.js parsed at', new Date().toISOString());

// ── 3. Deep link handler ───────────────────────────────────────────────────
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

// ── 4. Angular NGSW ────────────────────────────────────────────────────────
// Importato per ultimo: gestisce fetch caching Angular.
// Firebase (sopra) gestisce push; NGSW gestisce il resto.
try { importScripts('./ngsw-worker.js'); } catch (e) { /* dev: ngsw-worker.js not present */ }
