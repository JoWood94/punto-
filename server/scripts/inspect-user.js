require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
} else {
  console.error('FIREBASE_SERVICE_ACCOUNT env var required');
  process.exit(1);
}

const db = admin.firestore();

async function inspect(uid) {
  const snap = await db.collection('users').doc(uid).get();
  if (!snap.exists) {
    console.error(`User ${uid} not found`);
    process.exit(1);
  }
  const d = snap.data();
  console.log('encryptionSetup:', d.encryptionSetup);
  console.log('publicKey:', d.publicKey ? `present (len=${d.publicKey.length})` : 'MISSING');
  console.log('encryptedPrivateKey:', d.encryptedPrivateKey ? `present (len=${d.encryptedPrivateKey.length})` : 'MISSING');
  console.log('sessionVersion:', d.sessionVersion);
  console.log('fcmTokens count:', (d.fcmTokens ?? []).length);

  // Check note di Giuseppe per vedere se sono cifrate o in chiaro
  const notesSnap = await db.collection('notes').where('uid', '==', uid).limit(5).get();
  console.log(`\nFound ${notesSnap.size} notes (showing up to 5):`);
  for (const n of notesSnap.docs) {
    const note = n.data();
    const titlePreview = typeof note.title === 'string' ? note.title.substring(0, 80) : '(no title)';
    const isPgp = typeof note.title === 'string' && note.title.startsWith('-----BEGIN PGP MESSAGE-----');
    console.log(`- ${n.id}: title="${titlePreview}${titlePreview.length === 80 ? '...' : ''}" encrypted=${isPgp}`);
  }
}

inspect(process.argv[2]).then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
