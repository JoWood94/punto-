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
    console.log("Firebase Admin inizializzato correttamente tramite GitHub Secret.");
  } catch(e) {
    console.error("ERRORE CRITICO: Il formato del SECRET 'FIREBASE_SERVICE_ACCOUNT' non è un JSON valido.");
    console.error("Dettaglio errore parsing:", e.message);
    process.exit(1);
  }
} else if (fs.existsSync(serviceAccountPath)) {
  const serviceAccount = require(serviceAccountPath);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  console.log("Firebase Admin inizializzato tramite serviceAccountKey.json locale.");
} else {
  console.error("ERRORE: Nessuna credenziale Firebase trovata!");
  console.log("Assicurati che 'FIREBASE_SERVICE_ACCOUNT' sia impostato nei GitHub Secrets (per GHA)");
  console.log("o che 'server/serviceAccountKey.json' sia presente (per esecuzione locale).");

  if (process.env.GITHUB_ACTIONS === 'true') {
    process.exit(1);
  } else {
    console.log("Tentativo di inizializzazione predefinita (GCP/ADC)...");
    admin.initializeApp();
  }
}

const db = admin.firestore();
const TARGET_VERSION = '4.1.0';

async function checkVersions() {
  console.log('\n=== punto! — Client Version Report ===\n');

  const snapshot = await db.collection('users').get();

  const aggiornati = [];
  const nonAggiornati = [];

  snapshot.forEach(doc => {
    const data = doc.data();
    const uid = doc.id;
    const version = data.clientVersion || null;

    if (version === TARGET_VERSION) {
      aggiornati.push({ uid, version });
    } else {
      nonAggiornati.push({ uid, version });
    }
  });

  // Utenti aggiornati
  console.log(`✓ Aggiornati (v${TARGET_VERSION}):`);
  if (aggiornati.length === 0) {
    console.log('  (nessuno)');
  } else {
    aggiornati.forEach(u => {
      console.log(`  - ${u.uid} (clientVersion: ${u.version})`);
    });
  }

  // Utenti non aggiornati
  console.log(`\n✗ Non aggiornati:`);
  if (nonAggiornati.length === 0) {
    console.log('  (nessuno)');
  } else {
    nonAggiornati.forEach(u => {
      const vLabel = u.version ? u.version : 'nessuna versione';
      console.log(`  - ${u.uid} (${u.version ? 'clientVersion: ' + u.version : vLabel})`);
    });
  }

  const total = aggiornati.length + nonAggiornati.length;
  console.log(`\nRiepilogo: ${aggiornati.length}/${total} aggiornati\n`);

  process.exit(0);
}

checkVersions().catch(err => {
  console.error('Errore durante il check:', err);
  process.exit(1);
});
