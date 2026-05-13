#!/usr/bin/env node

/**
 * admin-delete-user.js
 *
 * Standalone CLI to fully erase a user account (GDPR Art. 17, Right to Erasure).
 * Performs the EXACT SAME procedure as the `deleteUserAccount` Cloud Function
 * by importing the shared core module:
 *
 *   server/functions/deleteUserAccount.js
 *
 * USE CASES:
 *   - Manual cancellation of a problematic account when the client UI is
 *     unavailable (account locked, browser broken, etc.).
 *   - End-to-end testing on staging before each Cloud Function release.
 *   - Forensic / dev-time exploration in a local Firestore emulator.
 *
 * USAGE:
 *
 *   # Dry-run is NOT supported (this script is destructive by design).
 *   # If you need a dry-run, use audit-shared-counts.js to inventory first.
 *
 *   export GOOGLE_APPLICATION_CREDENTIALS="/absolute/path/to/serviceAccountKey.json"
 *   node server/scripts/admin-delete-user.js --uid <FIREBASE_UID>
 *
 *   # Or:
 *   node server/scripts/admin-delete-user.js \
 *     --service-account /path/to/key.json \
 *     --uid <FIREBASE_UID>
 *
 *   # Required confirmation flag (operator must type the uid twice):
 *   node server/scripts/admin-delete-user.js \
 *     --uid <FIREBASE_UID> --confirm <FIREBASE_UID>
 *
 * SAFETY:
 *   - Refuses to run without `--confirm` matching `--uid`.
 *   - Refuses to run on prod project unless `PUNTO_ALLOW_PROD=1` env var set.
 *     (Detected by reading the project_id of the service account JSON.)
 *
 * EXIT CODES:
 *   0 = success, 1 = error
 */

const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

const { deleteUserAccount } = require('../functions/deleteUserAccount');

// ──────────────────────────────────────────────────────────────────────────────
// CLI parsing
// ──────────────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

function getArg(name) {
  const idx = args.indexOf(name);
  return idx !== -1 ? args[idx + 1] : null;
}

const targetUid = getArg('--uid');
const confirmUid = getArg('--confirm');
const serviceAccountPath = getArg('--service-account');

if (!targetUid) {
  console.error('ERROR: missing --uid <FIREBASE_UID>');
  process.exit(1);
}
if (confirmUid !== targetUid) {
  console.error(`ERROR: --confirm must match --uid. Re-run as:\n  node server/scripts/admin-delete-user.js --uid ${targetUid} --confirm ${targetUid}`);
  process.exit(1);
}

// ──────────────────────────────────────────────────────────────────────────────
// Admin SDK init (same pattern as audit-shared-counts.js)
// ──────────────────────────────────────────────────────────────────────────────

function initializeFirebase() {
  let projectId = null;
  if (serviceAccountPath) {
    const keyPath = path.resolve(serviceAccountPath);
    if (!fs.existsSync(keyPath)) {
      console.error(`Service account file not found: ${keyPath}`);
      process.exit(1);
    }
    const serviceAccount = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
    projectId = serviceAccount.project_id;
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      // storageBucket: defaults to <project_id>.appspot.com — adjust if custom.
      storageBucket: `${projectId}.appspot.com`,
    });
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    const envPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (!fs.existsSync(envPath)) {
      console.error(`GOOGLE_APPLICATION_CREDENTIALS path not found: ${envPath}`);
      process.exit(1);
    }
    const serviceAccount = JSON.parse(fs.readFileSync(envPath, 'utf8'));
    projectId = serviceAccount.project_id;
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      storageBucket: `${projectId}.appspot.com`,
    });
  } else {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
    });
  }
  return projectId;
}

// ──────────────────────────────────────────────────────────────────────────────
// Prod guard
// ──────────────────────────────────────────────────────────────────────────────

function checkProdGuard(projectId) {
  if (!projectId) return; // applicationDefault path — operator's responsibility
  const isProd = projectId === 'punto-84646';
  if (isProd && process.env.PUNTO_ALLOW_PROD !== '1') {
    console.error(
      `\nREFUSING TO RUN ON PRODUCTION (project=${projectId}).\n` +
      `Set PUNTO_ALLOW_PROD=1 to override. This is irreversible — make sure\n` +
      `you have a Firestore export backup BEFORE proceeding.\n`
    );
    process.exit(1);
  }
  console.log(`[admin-delete-user] Target project: ${projectId} (prod=${isProd})`);
}

// ──────────────────────────────────────────────────────────────────────────────
// Run
// ──────────────────────────────────────────────────────────────────────────────

(async () => {
  const projectId = initializeFirebase();
  checkProdGuard(projectId);

  console.log(`[admin-delete-user] Deleting uid=${targetUid} ...\n`);

  try {
    const result = await deleteUserAccount(admin, targetUid, {
      requestSource: 'admin',
      // pass-through: deleteUserAccount uses its own default console logger
    });

    console.log('\n=== DELETION SUMMARY ===');
    console.log(`  uidHash:    ${result.uidHash}`);
    console.log(`  auditDocId: ${result.auditDocId}`);
    console.log(`  counts:`);
    Object.entries(result.counts).forEach(([k, v]) => {
      console.log(`    ${k.padEnd(22)} ${v}`);
    });
    console.log('\n[SUCCESS] Account erased.');
    process.exit(0);
  } catch (err) {
    console.error('\n[ERROR] Deletion failed:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
})();
