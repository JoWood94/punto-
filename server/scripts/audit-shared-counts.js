#!/usr/bin/env node

/**
 * audit-shared-counts.js
 *
 * READ-ONLY audit script — counts existing shared-data artifacts before the
 * RF-02 sharing-links reset. Performs zero writes. Safe to run on prod.
 *
 * Reports:
 *   1) notes with at least one doc in subcollection `collaborators`
 *   2) notes with at least one doc in subcollection `sharedKeys`
 *      → split: exactly 1 entry vs >1 entries
 *      (post-reset target = ≤ 1, only the owner's wrap)
 *   3) calendars with `subscribers` count > 1
 *      (>1 because the owner is typically auto-subscribed → strict "shared" implies ≥ 2)
 *   4) invites still alive (expiresAt > now)
 *   5) top 5 owners (uid) by number of shared notes
 *      A note counts as "shared" if it has any collaborator OR > 1 sharedKeys entry.
 *
 * USAGE:
 *   export GOOGLE_APPLICATION_CREDENTIALS="/absolute/path/to/serviceAccountKey.json"
 *   node server/scripts/audit-shared-counts.js
 *
 *   OR:
 *   node server/scripts/audit-shared-counts.js --service-account /path/to/key.json
 *
 * EXIT CODES:
 *   0 = success, 1 = error
 *
 * NOTE on cost: this script issues many small reads (one listDocuments() per
 * note for each subcollection, one per calendar). Acceptable for ~hundreds of
 * notes (current scale ~12 users). Do NOT loop this on a cron.
 */

const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

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

const audit = async () => {
  const db = admin.firestore();
  console.log('[READ-ONLY] No writes will be performed.\n');

  // ── notes scan ───────────────────────────────────────────────────────────
  console.log('Scanning notes...');
  const notesSnap = await db.collection('notes').get();
  const totalNotes = notesSnap.size;
  console.log(`  total notes: ${totalNotes}`);

  let notesWithCollaborators = 0;
  let notesWithSharedKeysEq1 = 0;
  let notesWithSharedKeysGt1 = 0;
  // Map<ownerUid, count of "shared" notes>
  const ownerSharedCount = new Map();

  for (const noteDoc of notesSnap.docs) {
    const data = noteDoc.data();
    const ownerUid = data.uid;

    // Use listDocuments() (id-only, cheap) instead of get() to count.
    const collabRefs = await noteDoc.ref.collection('collaborators').listDocuments();
    const sharedKeyRefs = await noteDoc.ref.collection('sharedKeys').listDocuments();

    const hasCollaborators = collabRefs.length > 0;
    if (hasCollaborators) notesWithCollaborators++;

    if (sharedKeyRefs.length === 1) notesWithSharedKeysEq1++;
    else if (sharedKeyRefs.length > 1) notesWithSharedKeysGt1++;

    const isShared = hasCollaborators || sharedKeyRefs.length > 1;
    if (isShared && ownerUid) {
      ownerSharedCount.set(ownerUid, (ownerSharedCount.get(ownerUid) || 0) + 1);
    }
  }

  // ── calendars scan ───────────────────────────────────────────────────────
  console.log('Scanning calendars...');
  const calsSnap = await db.collection('calendars').get();
  const totalCalendars = calsSnap.size;
  let calendarsWithSubsGt1 = 0;
  for (const calDoc of calsSnap.docs) {
    const subRefs = await calDoc.ref.collection('subscribers').listDocuments();
    if (subRefs.length > 1) calendarsWithSubsGt1++;
  }

  // ── invites scan ─────────────────────────────────────────────────────────
  console.log('Scanning invites...');
  const now = Date.now();
  const invitesSnap = await db.collection('invites').get();
  let invitesAlive = 0;
  let invitesNoteAlive = 0;
  let invitesCalendarAlive = 0;
  for (const inv of invitesSnap.docs) {
    const d = inv.data();
    if (typeof d.expiresAt === 'number' && d.expiresAt > now) {
      invitesAlive++;
      if (d.type === 'note') invitesNoteAlive++;
      else if (d.type === 'calendar') invitesCalendarAlive++;
    }
  }

  // ── top 5 owners ─────────────────────────────────────────────────────────
  const top5 = [...ownerSharedCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  // ── report ───────────────────────────────────────────────────────────────
  console.log('\n=== AUDIT SUMMARY ===');
  console.log(`Total notes:                          ${totalNotes}`);
  console.log(`Notes w/ ≥1 collaborator subdoc:      ${notesWithCollaborators}`);
  console.log(`Notes w/ sharedKeys count == 1:       ${notesWithSharedKeysEq1}  (likely owner-only wrap, already-reduced state)`);
  console.log(`Notes w/ sharedKeys count > 1:        ${notesWithSharedKeysGt1}  (truly shared, target of reset)`);
  console.log(`\nTotal calendars:                      ${totalCalendars}`);
  console.log(`Calendars w/ subscribers > 1:         ${calendarsWithSubsGt1}`);
  console.log(`\nInvites total docs:                   ${invitesSnap.size}`);
  console.log(`Invites alive (expiresAt > now):      ${invitesAlive}`);
  console.log(`  └── type=note alive:                ${invitesNoteAlive}`);
  console.log(`  └── type=calendar alive:            ${invitesCalendarAlive}`);

  console.log(`\nTop 5 owners by shared-note count:`);
  if (top5.length === 0) {
    console.log('  (none)');
  } else {
    top5.forEach(([uid, count], i) => {
      console.log(`  #${i + 1}  ${uid}  →  ${count} shared notes`);
    });
  }

  console.log('\n[DONE] Read-only audit complete. No writes performed.');
};

initializeFirebase();
audit()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n[ERROR] Audit failed:', err.message);
    process.exit(1);
  });
