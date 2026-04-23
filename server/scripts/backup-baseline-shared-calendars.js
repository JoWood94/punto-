#!/usr/bin/env node

/**
 * backup-baseline-shared-calendars.js
 *
 * Pre-migration baseline backup for shared-calendars implementation.
 * Dumps complete collections `notes` and `users` to gzipped JSON.
 *
 * USAGE:
 *   export GOOGLE_APPLICATION_CREDENTIALS="/path/to/serviceAccountKey.json"
 *   node server/scripts/backup-baseline-shared-calendars.js
 *
 *   OR:
 *   node server/scripts/backup-baseline-shared-calendars.js --service-account /path/to/key.json
 *
 * OUTPUT:
 *   backups/baseline-YYYYMMDD-HHMMSS.json.gz
 *
 * FORMAT:
 *   {
 *     "timestamp": "ISO8601",
 *     "notes": [ { id, data }, ... ],
 *     "users": [ { id, data }, ... ]
 *   }
 *
 * STDOUT:
 *   - timestamp of backup
 *   - total doc count (notes + users)
 *   - per-collection breakdown
 *   - backup file path
 *   - SHA-256 of the gzipped file
 *
 * EXIT CODES:
 *   0 = success, 1 = error
 */

const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');
const zlib = require('zlib');
const crypto = require('crypto');

const args = process.argv.slice(2);
const serviceAccountPath = (() => {
  const idx = args.indexOf('--service-account');
  return idx !== -1 ? args[idx + 1] : null;
})();

const initializeFirebase = () => {
  if (serviceAccountPath) {
    const keyPath = path.resolve(serviceAccountPath);
    if (!fs.existsSync(keyPath)) {
      console.error(`Service account file not found: ${keyPath}`);
      process.exit(1);
    }
    const serviceAccount = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    const envPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (!fs.existsSync(envPath)) {
      console.error(`GOOGLE_APPLICATION_CREDENTIALS path not found: ${envPath}`);
      process.exit(1);
    }
    const serviceAccount = JSON.parse(fs.readFileSync(envPath, 'utf8'));
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  } else {
    admin.initializeApp({ credential: admin.credential.applicationDefault() });
  }
};

const timestamp = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
};

const isoTimestamp = () => new Date().toISOString();

const sha256OfFile = (filePath) =>
  new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });

const formatBytes = (bytes) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

const backup = async () => {
  const db = admin.firestore();
  const backupTimestamp = isoTimestamp();

  console.log(`Starting baseline backup at ${backupTimestamp}\n`);

  // Fetch notes
  console.log('Fetching all notes from Firestore...');
  const notesSnapshot = await db.collection('notes').get();
  const totalNotes = notesSnapshot.size;
  console.log(`Found ${totalNotes} note documents.\n`);

  const notes = [];
  for (const doc of notesSnapshot.docs) {
    notes.push({ id: doc.id, data: doc.data() });
  }

  // Fetch users
  console.log('Fetching all users from Firestore...');
  const usersSnapshot = await db.collection('users').get();
  const totalUsers = usersSnapshot.size;
  console.log(`Found ${totalUsers} user documents.\n`);

  const users = [];
  for (const doc of usersSnapshot.docs) {
    users.push({ id: doc.id, data: doc.data() });
  }

  // Create backup payload
  const payload = {
    timestamp: backupTimestamp,
    notes,
    users,
  };

  // Write to file
  const backupsDir = path.resolve(process.cwd(), 'backups');
  if (!fs.existsSync(backupsDir)) fs.mkdirSync(backupsDir, { recursive: true });

  const fileName = `baseline-${timestamp()}.json.gz`;
  const filePath = path.join(backupsDir, fileName);

  const json = JSON.stringify(payload, null, 2);
  const gzipped = zlib.gzipSync(Buffer.from(json, 'utf8'), { level: 9 });
  fs.writeFileSync(filePath, gzipped);

  const sha = await sha256OfFile(filePath);
  const size = fs.statSync(filePath).size;

  console.log('=== BASELINE BACKUP SUMMARY ===');
  console.log(`Backup timestamp:     ${backupTimestamp}`);
  console.log(`Total documents:      ${totalNotes + totalUsers}`);
  console.log(`  - notes:            ${totalNotes}`);
  console.log(`  - users:            ${totalUsers}`);
  console.log(`\nBackup file:  ${filePath}`);
  console.log(`Size:         ${formatBytes(size)}`);
  console.log(`SHA-256:      ${sha}`);
  console.log('\n[SUCCESS] Baseline backup written.');
  console.log('Keep the SHA-256 and this output for verification.');

  // Return structured output for programmatic use
  return {
    backupFile: filePath,
    timestamp: backupTimestamp,
    noteCount: totalNotes,
    userCount: totalUsers,
    size,
    sha256: sha,
  };
};

initializeFirebase();
backup()
  .then((result) => {
    console.log('\n=== ARTIFACT INFO (for CI/CD) ===');
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  })
  .catch((err) => {
    console.error('\n[ERROR] Backup failed:', err.message);
    process.exit(1);
  });
