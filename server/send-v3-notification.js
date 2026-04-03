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

async function sendV3Notification() {
  console.log("[punto! v3.0.0] Invio notifiche push a tutti gli utenti...");

  try {
    // Leggi tutti i documenti users/ che hanno fcmTokens non vuoto
    const usersSnapshot = await db.collection('users').get();

    let totalSent = 0;
    let usersWithTokens = 0;
    const failedUsers = [];

    for (const userDoc of usersSnapshot.docs) {
      const userData = userDoc.data();
      const fcmTokens = userData.fcmTokens || [];

      if (fcmTokens.length === 0) {
        continue;
      }

      usersWithTokens++;
      const uid = userDoc.id;

      try {
        const response = await messaging.sendEachForMulticast({
          tokens: fcmTokens,
          webpush: {
            notification: {
              title: 'punto! v3.0.0',
              body: 'Nuova interfaccia, più funzionalità. Chiudi l\'app dal selettore e riapri per aggiornare.',
              icon: '/icons/icon-192x192.png'
            },
            data: {
              title: 'punto! v3.0.0',
              body: 'Nuova interfaccia, più funzionalità. Chiudi l\'app dal selettore e riapri per aggiornare.'
            }
          }
        });

        let successCount = 0;
        const tokensToRemove = [];

        response.responses.forEach((resp, idx) => {
          if (resp.success) {
            successCount++;
          } else {
            const error = resp.error;
            if (error.code === 'messaging/invalid-registration-token' ||
                error.code === 'messaging/registration-token-not-registered') {
              tokensToRemove.push(fcmTokens[idx]);
            }
          }
        });

        // Rimuovi token invalidi
        if (tokensToRemove.length > 0) {
          await db.collection('users').doc(uid).update({
            fcmTokens: admin.firestore.FieldValue.arrayRemove(...tokensToRemove)
          });
          console.log(`  User ${uid}: ${successCount}/${fcmTokens.length} sent, ${tokensToRemove.length} removed`);
        } else {
          console.log(`  User ${uid}: ${successCount}/${fcmTokens.length} sent`);
        }

        totalSent += successCount;
      } catch (e) {
        console.error(`  ERRORE per user ${uid}:`, e.message);
        failedUsers.push(uid);
      }
    }

    console.log(`\n[Completato] Notifiche v3.0.0 inviate: ${totalSent}/${usersWithTokens} utenti`);
    if (failedUsers.length > 0) {
      console.log(`  Utenti con errori: ${failedUsers.join(', ')}`);
    }

    process.exit(0);
  } catch (error) {
    console.error("ERRORE critico:", error);
    process.exit(1);
  }
}

sendV3Notification();
