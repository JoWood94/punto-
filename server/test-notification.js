require('dotenv').config();
const admin = require('firebase-admin');
const fs = require('fs');

const serviceAccountPath = './serviceAccountKey.json';

if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    console.log('Firebase Admin inizializzato tramite GitHub Secret.');
  } catch (e) {
    console.error('ERRORE: FIREBASE_SERVICE_ACCOUNT non è un JSON valido:', e.message);
    process.exit(1);
  }
} else if (fs.existsSync(serviceAccountPath)) {
  admin.initializeApp({ credential: admin.credential.cert(require(serviceAccountPath)) });
  console.log('Firebase Admin inizializzato tramite serviceAccountKey.json locale.');
} else {
  console.error('ERRORE: Nessuna credenziale Firebase trovata!');
  process.exit(1);
}

const db = admin.firestore();
const messaging = admin.messaging();

async function sendTestNotification() {
  const targetUid = process.env.TARGET_UID || '';

  let userDocs = [];
  if (targetUid) {
    const snap = await db.collection('users').doc(targetUid).get();
    if (snap.exists) {
      userDocs = [snap];
    } else {
      console.log(`Utente ${targetUid} non trovato in Firestore.`);
      return;
    }
  } else {
    const snap = await db.collection('users').get();
    userDocs = snap.docs;
  }

  if (userDocs.length === 0) {
    console.log('Nessun utente trovato.');
    return;
  }

  console.log(`Invio notifica di test a ${userDocs.length} utente/i...`);
  let totalSent = 0;

  for (const userDoc of userDocs) {
    const data = userDoc.data();
    const fromDevices = Object.values(data.fcmDevices ?? {}).filter(t => typeof t === 'string');
    const legacy = (data.fcmTokens ?? []).filter(t => !fromDevices.includes(t));
    const tokens = [...fromDevices, ...legacy];
    console.log(`  [${userDoc.id}] fcmDevices=${fromDevices.length} fcmTokens(legacy)=${legacy.length}`);
    if (tokens.length === 0) {
      console.log(`  [${userDoc.id}] Nessun token FCM registrato — skip.`);
      continue;
    }

    console.log(`  [${userDoc.id}] ${tokens.length} token/s trovati, invio...`);

    const response = await messaging.sendEachForMulticast({
      tokens,
      // webpush.notification sovrascrive root notification per i token browser:
      // title e body vanno ripetuti qui, altrimenti arriva solo l'icona
      webpush: {
        notification: {
          title: 'punto! — Test Notifica',
          body: 'Se vedi questo, le push notification funzionano!',
          icon: '/punto-/icons/icon-192x192.png',
        },
        data: {
          title: 'punto! — Test Notifica',
          body: 'Se vedi questo, le push notification funzionano!',
        }
      }
    });

    const failedTokens = [];
    response.responses.forEach((resp, idx) => {
      if (resp.success) {
        totalSent++;
        console.log(`    Token ${idx}: OK`);
      } else {
        console.warn(`    Token ${idx}: FALLITO — ${resp.error?.code}`);
        if (
          resp.error?.code === 'messaging/invalid-registration-token' ||
          resp.error?.code === 'messaging/registration-token-not-registered'
        ) {
          failedTokens.push(tokens[idx]);
        }
      }
    });

    if (failedTokens.length > 0) {
      await db.collection('users').doc(userDoc.id).update({
        fcmTokens: admin.firestore.FieldValue.arrayRemove(...failedTokens)
      });
      console.log(`  Rimossi ${failedTokens.length} token non validi da Firestore.`);
    }
  }

  console.log(`\nTest completato. Notifiche consegnate a FCM: ${totalSent}`);
  if (totalSent === 0) {
    console.error('ATTENZIONE: Nessuna notifica inviata. Verifica che ci siano token FCM validi in Firestore (collection users → campo fcmTokens).');
    process.exit(1);
  }
}

sendTestNotification()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
