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

async function notifyNewVersion() {
  const version = process.env.APP_VERSION || '?';
  const customMessage = process.env.RELEASE_MESSAGE || '';

  const title = `punto! ${version} è disponibile`;
  const body = [
    customMessage,
    'Se usi la PWA, per aggiornare chiudi l\'app dal selettore delle app recenti e riaprila.'
  ].filter(Boolean).join(' — ');

  console.log(`\nInvio notifica di rilascio:`);
  console.log(`  Titolo: ${title}`);
  console.log(`  Corpo:  ${body}\n`);

  const usersSnap = await db.collection('users').get();
  if (usersSnap.empty) {
    console.log('Nessun utente trovato.');
    return;
  }

  let totalSent = 0;

  for (const userDoc of usersSnap.docs) {
    const tokens = userDoc.data().fcmTokens || [];
    if (tokens.length === 0) {
      console.log(`  [${userDoc.id}] Nessun token — skip.`);
      continue;
    }

    console.log(`  [${userDoc.id}] ${tokens.length} token/s...`);

    const response = await messaging.sendEachForMulticast({
      tokens,
      webpush: {
        notification: { title, body, icon: '/punto-/icons/icon-192x192.png' },
        data: { title, body }
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
      console.log(`  Rimossi ${failedTokens.length} token non validi.`);
    }
  }

  console.log(`\nNotifica rilascio inviata a ${totalSent} device/s.`);
}

notifyNewVersion()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
