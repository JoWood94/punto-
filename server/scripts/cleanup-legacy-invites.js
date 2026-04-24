#!/usr/bin/env node

/**
 * cleanup-legacy-invites.js
 *
 * One-shot cleanup of the `invites` collection after the share-by-code
 * migration. Deletes every doc whose id does NOT match the new share-by-code
 * LOOKUP format (8 chars from the unambiguous-base32 uppercase alphabet):
 *
 *   ^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$
 *
 * Legacy docs (20-char alphanumeric tokens, any other format) are deleted.
 * Non-matching docs are considered stale: the new client can't create them
 * anymore (Firestore rules enforce the regex on create), and they can't be
 * consumed by the new join flow either.
 *
 * USAGE:
 *   # Dry-run (default — prints counts without touching the DB):
 *   export GOOGLE_APPLICATION_CREDENTIALS="/absolute/path/to/serviceAccountKey.json"
 *   node server/scripts/cleanup-legacy-invites.js
 *
 *   # Apply (really deletes):
 *   node server/scripts/cleanup-legacy-invites.js --apply
 *
 *   # Alternative credential source:
 *   node server/scripts/cleanup-legacy-invites.js --service-account /path/to/key.json
 *
 * OUTPUT:
 *   - total doc count
 *   - count of docs matching the new LOOKUP format (kept)
 *   - count of docs NOT matching (would be / were deleted)
 *   - sample of up to 10 legacy ids for audit
 *   - progress every 200 deletes in --apply mode
 *
 * EXIT CODES:
 *   0 = success (including dry-run), 1 = error
 */

const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const serviceAccountPath = (() => {
  const idx = args.indexOf('--service-account');
  return idx !== -1 ? args[idx + 1] : null;
})();

const LOOKUP_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/;
const BATCH_SIZE = 400; // Firestore batch limit is 500; leave margin.
const SAMPLE_SIZE = 10;

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

const cleanup = async () => {
  const db = admin.firestore();
  console.log(`Mode: ${APPLY ? 'APPLY (will delete)' : 'DRY-RUN (no writes)'}\n`);
  console.log('Fetching all invites from Firestore...');
  const snapshot = await db.collection('invites').get();
  const total = snapshot.size;
  console.log(`Found ${total} invite documents.\n`);

  const legacyIds = [];
  let keptCount = 0;

  for (const doc of snapshot.docs) {
    if (LOOKUP_RE.test(doc.id)) {
      keptCount++;
    } else {
      legacyIds.push(doc.id);
    }
  }

  console.log('=== SCAN SUMMARY ===');
  console.log(`Total documents:       ${total}`);
  console.log(`Match new LOOKUP fmt:  ${keptCount}`);
  console.log(`Legacy (to delete):    ${legacyIds.length}`);

  if (legacyIds.length > 0) {
    const sample = legacyIds.slice(0, SAMPLE_SIZE);
    console.log(`\nSample of legacy ids (first ${sample.length}):`);
    sample.forEach((id) => console.log(`  ${id}`));
    if (legacyIds.length > SAMPLE_SIZE) {
      console.log(`  ... (+${legacyIds.length - SAMPLE_SIZE} more)`);
    }
  }

  if (!APPLY) {
    console.log(
      '\n[DRY-RUN] No writes performed. Re-run with --apply to delete the legacy documents.'
    );
    return;
  }

  if (legacyIds.length === 0) {
    console.log('\n[DONE] Nothing to delete — collection is already clean.');
    return;
  }

  console.log(`\nDeleting ${legacyIds.length} legacy documents in batches of ${BATCH_SIZE}...`);
  let deleted = 0;
  for (let i = 0; i < legacyIds.length; i += BATCH_SIZE) {
    const chunk = legacyIds.slice(i, i + BATCH_SIZE);
    const batch = db.batch();
    chunk.forEach((id) => batch.delete(db.collection('invites').doc(id)));
    await batch.commit();
    deleted += chunk.length;
    if (deleted % 200 === 0 || deleted === legacyIds.length) {
      console.log(`  progress: ${deleted}/${legacyIds.length}`);
    }
  }

  console.log(`\n[SUCCESS] Deleted ${deleted} legacy invite documents.`);
  console.log(`Remaining (new format): ${keptCount}`);
};

initializeFirebase();
cleanup()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n[ERROR] Cleanup failed:', err.message);
    process.exit(1);
  });
