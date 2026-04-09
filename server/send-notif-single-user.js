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

async function sendToSingleUser() {
  const targetUid = process.env.TARGET_UID || 'W42XL7UVYFRMakpZJdrpcGkgsQr1';
  const title = process.env.NOTIF_TITLE || 'punto! — Aggiornamento';
  const body = process.env.NOTIF_BODY || 'Nuova versione disponibile.';
  console.log(`[punto! BF-68] Invio notifica a user: ${targetUid}...`);

  try {
    const userRef = db.collection('users').doc(targetUid);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      console.error(`ERRORE: User ${targetUid} non trovato`);
      process.exit(1);
    }

    const userData = userDoc.data();
    const fcmTokens = userData.fcmTokens || [];

    if (fcmTokens.length === 0) {
      console.log(`ERRORE: User ${targetUid} non ha token FCM registrati`);
      process.exit(1);
    }

    console.log(`User ${targetUid} ha ${fcmTokens.length} token registrati`);

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

    let successCount = 0;
    const tokensToRemove = [];

    response.responses.forEach((resp, idx) => {
      if (resp.success) {
        successCount++;
        console.log(`  Token ${idx+1}/${fcmTokens.length}: ✓ sent`);
      } else {
        const error = resp.error;
        console.log(`  Token ${idx+1}/${fcmTokens.length}: ✗ ${error.code}`);
        if (error.code === 'messaging/invalid-registration-token' ||
            error.code === 'messaging/registration-token-not-registered') {
          tokensToRemove.push(fcmTokens[idx]);
        }
      }
    });

    // Rimuovi token invalidi
    if (tokensToRemove.length > 0) {
      await db.collection('users').doc(targetUid).update({
        fcmTokens: admin.firestore.FieldValue.arrayRemove(...tokensToRemove)
      });
      console.log(`\n[Completato] Notifiche inviate: ${successCount}/${fcmTokens.length}, ${tokensToRemove.length} token rimossi`);
    } else {
      console.log(`\n[Completato] Notifiche inviate: ${successCount}/${fcmTokens.length}`);
    }

    process.exit(0);
  } catch (error) {
    console.error("ERRORE critico:", error);
    process.exit(1);
  }
}

sendToSingleUser();
