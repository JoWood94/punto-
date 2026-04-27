require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const serviceAccountPath = path.resolve(__dirname, '../serviceAccountKey.json');

if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
} else if (fs.existsSync(serviceAccountPath)) {
  const serviceAccount = require(serviceAccountPath);
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
} else {
  console.error('Nessuna credenziale Firebase trovata. Imposta FIREBASE_SERVICE_ACCOUNT o crea server/serviceAccountKey.json');
  process.exit(1);
}

const db = admin.firestore();

async function clearFcmTokens(uid) {
  if (!uid) {
    console.error('Uso: node scripts/clear-fcm-tokens.js <uid>');
    process.exit(1);
  }
  const userRef = db.collection('users').doc(uid);
  const snap = await userRef.get();
  if (!snap.exists) {
    console.error(`Utente ${uid} non trovato in users/`);
    process.exit(1);
  }
  const before = (snap.data().fcmTokens ?? []).length;
  await userRef.update({ fcmTokens: [] });
  console.log(`Cancellati ${before} FCM token per uid=${uid}`);
}

clearFcmTokens(process.argv[2])
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
