require('dotenv').config();
const admin = require('firebase-admin');
const fs = require('fs');

// Initialize Firebase Admin SDK (reuse same pattern as index.js)
const serviceAccountPath = './serviceAccountKey.json';

if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    console.log("Firebase Admin inizializzato tramite FIREBASE_SERVICE_ACCOUNT");
  } catch(e) {
    console.error("Errore parsing Firebase secret:", e.message);
    process.exit(1);
  }
} else if (fs.existsSync(serviceAccountPath)) {
  const serviceAccount = require(serviceAccountPath);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  console.log("Firebase Admin inizializzato da serviceAccountKey.json locale");
} else {
  console.error("Errore: nessuna credenziale Firebase trovata");
  process.exit(1);
}

const db = admin.firestore();
const messaging = admin.messaging();

async function sendVersionNotification() {
  try {
    console.log("Recupero utenti con FCM tokens...");

    const usersSnapshot = await db.collection('users').get();

    const allTokens = [];
    usersSnapshot.forEach(doc => {
      const userData = doc.data();
      if (userData.fcmTokens && Array.isArray(userData.fcmTokens) && userData.fcmTokens.length > 0) {
        allTokens.push(...userData.fcmTokens);
      }
    });

    if (allTokens.length === 0) {
      console.log("Nessun utente con FCM tokens trovato.");
      return;
    }

    console.log(`Trovati ${allTokens.length} token FCM da ${usersSnapshot.size} utenti`);

    const title = process.env.NOTIFICATION_TITLE || 'punto! v1.3.1';
    const body = process.env.NOTIFICATION_BODY || 'Fix notifiche, swipe mobile, promemoria ricorrenti e altri miglioramenti';

    const message = {
      webpush: {
        notification: {
          title: title,
          body: body,
          icon: '/punto-/icons/icon-192x192.png'
        },
        data: {
          title: title,
          body: body
        }
      }
    };

    console.log("Invio notifica a tutti gli utenti...");
    const response = await messaging.sendEachForMulticast({
      tokens: allTokens,
      ...message
    });

    console.log(`Notifiche inviate: ${response.successCount}/${allTokens.length}`);
    console.log(`Fallimenti: ${response.failureCount}`);

    if (response.failureCount > 0) {
      const failedTokens = [];
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          failedTokens.push(allTokens[idx]);
        }
      });
      console.log(`Pulizia ${failedTokens.length} token non validi...`);
      // Nota: in un'app reale, pulirebbero i token non validi da ogni documento utente
    }

    console.log("Notificazione di versione completata!");
  } catch (error) {
    console.error("Errore durante invio notifica versione:", error);
    process.exit(1);
  }
}

sendVersionNotification();
