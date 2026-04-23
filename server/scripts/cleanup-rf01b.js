#!/usr/bin/env node

/**
 * cleanup-rf01b.js
 *
 * One-shot script to remove obsolete top-level fields from Firestore `notes` collection.
 *
 * These fields are no longer written by the current client (buildPayload in noteService)
 * and should be removed from legacy documents:
 *   - address, lat, lon (replaced by geolocation.address, geolocation.lat, geolocation.lon)
 *   - checklist (replaced by checklist[] array at root, but legacy docs have it as object)
 *   - lastCompletedAt (Fase A frontend no longer writes it; approved for removal)
 *
 * RUNBOOK:
 * --------
 * 1. **BACKUP**: Export Firestore before --apply
 *    gcloud firestore export gs://your-bucket/backup-$(date +%Y%m%d-%H%M%S)
 *
 * 2. **DRY-RUN** (default, no changes):
 *    node server/scripts/cleanup-rf01b.js
 *    Review output: total scanned, total cleaned, field counts
 *
 * 3. **APPLY** (make actual deletes):
 *    node server/scripts/cleanup-rf01b.js --apply
 *
 * 4. **VERIFY**: Spot-check 3–5 documents in Firebase Console
 *    → Confirm address, lat, lon, checklist, lastCompletedAt are gone
 *
 * CREDENTIALS:
 * Set GOOGLE_APPLICATION_CREDENTIALS env var pointing to service account JSON,
 * or pass --service-account <path/to/key.json>
 *
 *   export GOOGLE_APPLICATION_CREDENTIALS="/path/to/serviceAccountKey.json"
 *   node server/scripts/cleanup-rf01b.js --apply
 *
 *   OR:
 *
 *   node server/scripts/cleanup-rf01b.js --apply --service-account /path/to/key.json
 */

const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

// Parse CLI args
const args = process.argv.slice(2);
const dryRun = !args.includes('--apply');
const serviceAccountPath = (() => {
  const idx = args.indexOf('--service-account');
  return idx !== -1 ? args[idx + 1] : null;
})();

// Initialize Firebase Admin
const initializeFirebase = () => {
  if (serviceAccountPath) {
    const keyPath = path.resolve(serviceAccountPath);
    if (!fs.existsSync(keyPath)) {
      console.error(`Service account file not found: ${keyPath}`);
      process.exit(1);
    }
    const serviceAccount = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    const envPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (!fs.existsSync(envPath)) {
      console.error(`GOOGLE_APPLICATION_CREDENTIALS path not found: ${envPath}`);
      process.exit(1);
    }
    const serviceAccount = JSON.parse(fs.readFileSync(envPath, 'utf8'));
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  } else {
    // Fallback: use application default credentials (e.g., gcloud auth)
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
    });
  }
};

// Fields to remove from top level
const FIELDS_TO_CLEAN = ['address', 'lat', 'lon', 'checklist', 'lastCompletedAt'];

// Track statistics
let totalDocs = 0;
let cleanedDocs = 0;
const fieldStats = {};
FIELDS_TO_CLEAN.forEach(f => (fieldStats[f] = 0));

/**
 * Format percentage with cap at 100
 */
const formatPercent = (current, total) => {
  if (total === 0) return '0%';
  const pct = Math.min(100, Math.round((current / total) * 100));
  return pct + '%';
};

/**
 * Log progress without newline (overwrite-friendly)
 */
const logProgress = (processed, total) => {
  const pct = formatPercent(processed, total);
  process.stdout.write(
    `\rProcessed ${processed}/${total} (${pct}) — cleaned ${cleanedDocs} docs`
  );
};

/**
 * Main cleanup function
 */
const cleanupNotes = async () => {
  console.log(
    dryRun
      ? '[DRY-RUN MODE] No changes will be made\n'
      : '[APPLY MODE] Changes will be committed\n'
  );

  const db = admin.firestore();
  const notesRef = db.collection('notes');

  try {
    // Fetch all documents
    console.log('Fetching all notes from Firestore...');
    const snapshot = await notesRef.get();
    const allDocs = snapshot.docs;
    totalDocs = allDocs.length;
    console.log(`Found ${totalDocs} documents.\n`);

    if (totalDocs === 0) {
      console.log('No documents to process.');
      return;
    }

    // Prepare batch operations
    const batch = db.batch();
    let batchSize = 0;
    const maxBatchSize = 400; // Firestore batch limit is 500, use 400 for safety

    // Scan each document
    for (let i = 0; i < allDocs.length; i++) {
      const doc = allDocs[i];
      const data = doc.data();

      // Identify which fields exist in this doc
      const fieldsToDelete = [];
      FIELDS_TO_CLEAN.forEach(field => {
        if (data.hasOwnProperty(field)) {
          fieldsToDelete.push(field);
          fieldStats[field]++;
        }
      });

      // If any fields need deletion, queue the update
      if (fieldsToDelete.length > 0) {
        cleanedDocs++;

        const updatePayload = {};
        fieldsToDelete.forEach(field => {
          updatePayload[field] = admin.firestore.FieldValue.delete();
        });

        batch.update(doc.ref, updatePayload);
        batchSize++;
      }

      // Flush batch if it reaches max size
      if (batchSize >= maxBatchSize) {
        if (!dryRun) {
          await batch.commit();
        }
        batchSize = 0;
      }

      // Log progress
      logProgress(i + 1, totalDocs);
    }

    // Flush remaining batch
    if (batchSize > 0 && !dryRun) {
      await batch.commit();
    }

    console.log('\n'); // Move to next line after progress counter

    // Print final report
    console.log('=== CLEANUP SUMMARY ===');
    console.log(`Total documents scanned: ${totalDocs}`);
    console.log(`Documents with obsolete fields: ${cleanedDocs}`);
    console.log(`\nField occurrence counts:`);
    FIELDS_TO_CLEAN.forEach(field => {
      console.log(`  ${field}: ${fieldStats[field]}`);
    });

    if (dryRun) {
      console.log(
        '\n[DRY-RUN] No changes committed. Run with --apply to execute.'
      );
    } else {
      console.log('\n[SUCCESS] All changes committed to Firestore.');
    }
  } catch (error) {
    console.error('\n[ERROR] Cleanup failed:', error.message);
    process.exit(1);
  }
};

// Run
initializeFirebase();
cleanupNotes().then(() => {
  process.exit(0);
});
