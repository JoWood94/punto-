#!/usr/bin/env node

/**
 * backup-sharing-links.js
 *
 * Local backup of every Firestore artifact that the RF-02 sharing-reset
 * (`reset-sharing-links.js`) will delete or mutate. Run this BEFORE invoking
 * the reset script with `--apply`. Spark plan has no managed exports, so this
 * is the only safety net.
 *
 * What it backs up:
 *   1) For every note (`notes/{noteId}`):
 *        - subcollection `collaborators/*`
 *        - subcollection `sharedKeys/*`   (wrappedKey is already wrapped — safe)
 *   2) For every calendar (`calendars/{calId}`):
 *        - subcollection `subscribers/*`
 *   3) Every invite doc (`invites/{token}`) — both alive and expired, for safety.
 *
 * Output structure (single JSON file):
 *   {
 *     "_metadata": {
 *       "timestamp": "...",
 *       "projectId": "...",
 *       "totalDocs": <int>,
 *       "counts": { collaborators, sharedKeys, subscribers, invites },
 *       "notesScanned": <int>,
 *       "calendarsScanned": <int>
 *     },
 *     "notes":     { "<noteId>": { "collaborators": {<uid>: {...}}, "sharedKeys": {<uid>: {...}} } },
 *     "calendars": { "<calId>":  { "subscribers": {<uid>: {...}} } },
 *     "invites":   { "<token>":  {...full invite doc data...} }
 *   }
 *
 * Firestore Timestamps are serialized as { _seconds, _nanoseconds } via the
 * Admin SDK's toJSON() (default JSON.stringify behaviour on the SDK objects).
 *
 * USAGE:
 *   export GOOGLE_APPLICATION_CREDENTIALS="/abs/path/to/serviceAccountKey.json"
 *   node server/scripts/backup-sharing-links.js
 *
 *   OR:
 *   node server/scripts/backup-sharing-links.js --service-account /path/to/key.json
 *
 *   OR (custom output dir, default is server/scripts/backups):
 *   node server/scripts/backup-sharing-links.js --out /tmp/punto-backups
 *
 * OUTPUT FILE:
 *   server/scripts/backups/sharing-reset-YYYYMMDD-HHMMSS.json
 *   (uncompressed JSON — small enough at current scale, easier to inspect)
 *
 * STDOUT:
 *   - per-section progress
 *   - final counts
 *   - file path + size + SHA-256
 *
 * EXIT CODES:
 *   0 = success, 1 = error
 */

const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const args = process.argv.slice(2);
const argValue = (flag) => {
  const idx = args.indexOf(flag);
  return idx !== -1 ? args[idx + 1] : null;
};

const serviceAccountPath = argValue('--service-account');
const outDirArg = argValue('--out');

let resolvedProjectId = null;

const initializeFirebase = () => {
  if (serviceAccountPath) {
    const keyPath = path.resolve(serviceAccountPath);
    if (!fs.existsSync(keyPath)) {
      console.error(`Service account file not found: ${keyPath}`);
      process.exit(1);
    }
    const serviceAccount = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
    resolvedProjectId = serviceAccount.project_id || null;
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    const envPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (!fs.existsSync(envPath)) {
      console.error(`GOOGLE_APPLICATION_CREDENTIALS path not found: ${envPath}`);
      process.exit(1);
    }
    const serviceAccount = JSON.parse(fs.readFileSync(envPath, 'utf8'));
    resolvedProjectId = serviceAccount.project_id || null;
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

/**
 * Serialize Firestore Timestamps deterministically. The Admin SDK Timestamp
 * exposes toMillis()/toDate(). We persist both _seconds/_nanoseconds (matches
 * REST export shape) and an ISO mirror for human inspection.
 */
const serializeValue = (v) => {
  if (v === null || v === undefined) return v;
  if (v instanceof admin.firestore.Timestamp) {
    return {
      __type: 'timestamp',
      _seconds: v.seconds,
      _nanoseconds: v.nanoseconds,
      _iso: v.toDate().toISOString(),
    };
  }
  if (v instanceof admin.firestore.GeoPoint) {
    return { __type: 'geopoint', latitude: v.latitude, longitude: v.longitude };
  }
  if (v instanceof admin.firestore.DocumentReference) {
    return { __type: 'docref', path: v.path };
  }
  if (Array.isArray(v)) return v.map(serializeValue);
  if (typeof v === 'object') {
    const out = {};
    for (const [k, val] of Object.entries(v)) out[k] = serializeValue(val);
    return out;
  }
  return v;
};

const serializeDoc = (doc) => serializeValue(doc.data() || {});

const backup = async () => {
  const db = admin.firestore();

  const counts = { collaborators: 0, sharedKeys: 0, subscribers: 0, invites: 0 };
  const out = {
    _metadata: {
      timestamp: new Date().toISOString(),
      projectId: resolvedProjectId,
      totalDocs: 0,
      counts,
      notesScanned: 0,
      calendarsScanned: 0,
    },
    notes: {},
    calendars: {},
    invites: {},
  };

  // ── notes ────────────────────────────────────────────────────────────────
  console.log('Scanning notes...');
  const notesSnap = await db.collection('notes').get();
  out._metadata.notesScanned = notesSnap.size;
  console.log(`  notes: ${notesSnap.size}`);

  for (const noteDoc of notesSnap.docs) {
    const noteId = noteDoc.id;
    const collabSnap = await noteDoc.ref.collection('collaborators').get();
    const skSnap = await noteDoc.ref.collection('sharedKeys').get();

    if (collabSnap.empty && skSnap.empty) continue;

    const entry = { collaborators: {}, sharedKeys: {} };
    for (const c of collabSnap.docs) {
      entry.collaborators[c.id] = serializeDoc(c);
      counts.collaborators++;
    }
    for (const sk of skSnap.docs) {
      entry.sharedKeys[sk.id] = serializeDoc(sk);
      counts.sharedKeys++;
    }
    out.notes[noteId] = entry;
  }

  // ── calendars ────────────────────────────────────────────────────────────
  console.log('Scanning calendars...');
  const calsSnap = await db.collection('calendars').get();
  out._metadata.calendarsScanned = calsSnap.size;
  console.log(`  calendars: ${calsSnap.size}`);

  for (const calDoc of calsSnap.docs) {
    const calId = calDoc.id;
    const subSnap = await calDoc.ref.collection('subscribers').get();
    if (subSnap.empty) continue;
    const entry = { subscribers: {} };
    for (const s of subSnap.docs) {
      entry.subscribers[s.id] = serializeDoc(s);
      counts.subscribers++;
    }
    out.calendars[calId] = entry;
  }

  // ── invites (all of them, alive + expired) ──────────────────────────────
  console.log('Scanning invites...');
  const invitesSnap = await db.collection('invites').get();
  console.log(`  invites: ${invitesSnap.size}`);
  for (const inv of invitesSnap.docs) {
    out.invites[inv.id] = serializeDoc(inv);
    counts.invites++;
  }

  out._metadata.totalDocs =
    counts.collaborators + counts.sharedKeys + counts.subscribers + counts.invites;

  // ── write file ──────────────────────────────────────────────────────────
  const backupsDir = outDirArg
    ? path.resolve(outDirArg)
    : path.resolve(__dirname, 'backups');
  if (!fs.existsSync(backupsDir)) fs.mkdirSync(backupsDir, { recursive: true });

  const fileName = `sharing-reset-${timestamp()}.json`;
  const filePath = path.join(backupsDir, fileName);

  const json = JSON.stringify(out, null, 2);
  fs.writeFileSync(filePath, json);

  const sha = await sha256OfFile(filePath);
  const size = fs.statSync(filePath).size;

  console.log('\n=== BACKUP SUMMARY ===');
  console.log(`Project:                 ${resolvedProjectId || '(unknown)'}`);
  console.log(`Notes scanned:           ${out._metadata.notesScanned}`);
  console.log(`Calendars scanned:       ${out._metadata.calendarsScanned}`);
  console.log(`collaborators backed-up: ${counts.collaborators}`);
  console.log(`sharedKeys    backed-up: ${counts.sharedKeys}`);
  console.log(`subscribers   backed-up: ${counts.subscribers}`);
  console.log(`invites       backed-up: ${counts.invites}`);
  console.log(`TOTAL docs:              ${out._metadata.totalDocs}`);
  console.log(`\nBackup file:  ${filePath}`);
  console.log(`Size:         ${formatBytes(size)}`);
  console.log(`SHA-256:      ${sha}`);
  console.log('\n[SUCCESS] Backup written. Keep the SHA-256 for integrity verification.');
};

initializeFirebase();
backup()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n[ERROR] Backup failed:', err.message);
    console.error(err.stack);
    process.exit(1);
  });
