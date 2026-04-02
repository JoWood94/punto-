/**
 * One-shot migration: imposta emailVerified=true per tutti gli utenti esistenti.
 * Eseguire una sola volta da locale: node server/migrate-verify-all-users.js
 */
require('dotenv').config();
const admin = require('firebase-admin');
const fs = require('fs');

const serviceAccountPath = '../../punto-84646-firebase-adminsdk-fbsvc-2efc83cb22.json';

if (fs.existsSync(serviceAccountPath)) {
  admin.initializeApp({ credential: admin.credential.cert(require(serviceAccountPath)) });
} else if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
} else {
  console.error('Nessuna credenziale trovata. Metti serviceAccountKey.json in server/');
  process.exit(1);
}

async function verifyAllUsers() {
  let nextPageToken;
  let updated = 0;
  let skipped = 0;

  do {
    const result = await admin.auth().listUsers(1000, nextPageToken);
    for (const user of result.users) {
      if (!user.emailVerified) {
        await admin.auth().updateUser(user.uid, { emailVerified: true });
        console.log(`✓ ${user.email} (${user.uid})`);
        updated++;
      } else {
        skipped++;
      }
    }
    nextPageToken = result.pageToken;
  } while (nextPageToken);

  console.log(`\nFatto. Aggiornati: ${updated}, già verificati: ${skipped}`);
}

verifyAllUsers().catch(err => {
  console.error(err);
  process.exit(1);
});
