require('dotenv').config();
const admin = require('firebase-admin');
const fs = require('fs');

// Initialize Firebase Admin SDK
const serviceAccountPath = './serviceAccountKey.json';

if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    console.log("Firebase Admin inizializzato tramite GitHub Secret.");
  } catch(e) {
    console.error("ERRORE: Formato SECRET non valido:", e.message);
    process.exit(1);
  }
} else if (fs.existsSync(serviceAccountPath)) {
  const serviceAccount = require(serviceAccountPath);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  console.log("Firebase Admin inizializzato tramite serviceAccountKey.json.");
} else {
  try {
    admin.initializeApp({
      projectId: 'punto-84646'
    });
    console.log("Firebase Admin inizializzato tramite Application Default Credentials.");
  } catch (e) {
    console.error("ERRORE: Nessuna credenziale Firebase trovata!");
    process.exit(1);
  }
}

const db = admin.firestore();
const messaging = admin.messaging();

async function sendToAllUsers() {
  const title = process.env.NOTIF_TITLE || 'punto! — Aggiornamento';
  const body = process.env.NOTIF_BODY || 'Nuova versione disponibile. Chiudi e riapri l\'app per aggiornare.';
  console.log(`[punto! broadcast] Invio notifica a tutti gli utenti...`);

  try {
    const usersSnapshot = await db.collection('users').get();

    if (usersSnapshot.empty) {
      console.log('Nessun utente trovato.');
      process.exit(0);
    }

    console.log(`Trovati ${usersSnapshot.size} utenti.`);

    let totalSuccess = 0;
    let totalFailed = 0;
    let totalTokens = 0;

    for (const userDoc of usersSnapshot.docs) {
      const uid = userDoc.id;
      const userData = userDoc.data();
      const fcmTokens = userData.fcmTokens || [];

      if (fcmTokens.length === 0) {
        console.log(`  User ${uid}: nessun token, skip.`);
        continue;
      }

      totalTokens += fcmTokens.length;
      console.log(`  User ${uid}: ${fcmTokens.length} token...`);

      const response = await messaging.sendEachForMulticast({
        tokens: fcmTokens,
        webpush: {
          notification: {
            title,
            body,
            icon: '/icons/icon-192x192.png'
          },
          data: {
            title,
            body
          }
        }
      });

      const tokensToRemove = [];
      response.responses.forEach((resp, idx) => {
        if (resp.success) {
          totalSuccess++;
        } else {
          totalFailed++;
          const error = resp.error;
          if (error.code === 'messaging/invalid-registration-token' ||
              error.code === 'messaging/registration-token-not-registered') {
            tokensToRemove.push(fcmTokens[idx]);
          }
        }
      });

      if (tokensToRemove.length > 0) {
        await db.collection('users').doc(uid).update({
          fcmTokens: admin.firestore.FieldValue.arrayRemove(...tokensToRemove)
        });
        console.log(`    ${tokensToRemove.length} token invalidi rimossi.`);
      }
    }

    console.log(`\n[Completato] Utenti: ${usersSnapshot.size}, Token totali: ${totalTokens}, Inviati: ${totalSuccess}, Falliti: ${totalFailed}`);
    process.exit(0);
  } catch (error) {
    console.error("ERRORE critico:", error);
    process.exit(1);
  }
}

sendToAllUsers();
