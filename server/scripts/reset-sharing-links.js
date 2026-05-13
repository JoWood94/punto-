#!/usr/bin/env node

/**
 * reset-sharing-links.js
 *
 * Strategy A reset for the RF-02 crypto refactor: wipes all sharing
 * artifacts WITHOUT migrating ciphertexts. Each note returns to "owner-only".
 *
 * What this script deletes:
 *   1) every doc in `notes/{id}/collaborators/{uid}` (full subcollection wipe)
 *   2) every doc in `notes/{id}/sharedKeys/{uid}` EXCEPT the owner's wrap
 *      (preserve `sharedKeys/{notes.uid}` so the owner can still decrypt
 *      the AES-encrypted title/content; if we deleted it the owner loses
 *      access to their own note)
 *   3) every doc in `calendars/{id}/subscribers/{uid}` EXCEPT the owner
 *      (calendars are plaintext today — no key concerns — but the owner
 *      auto-subscribes to their own calendar, so we keep that doc)
 *   4) every doc in `invites/{token}` whose `expiresAt > now`
 *      (revoke pending share links so accepting them is a no-op)
 *
 * What this script does NOT touch:
 *   - the parent note/calendar document itself
 *   - `notes/{id}.collaboratorUids` array field (FE clients will rewrite
 *     this to [] on next save; cleared up below as a best-effort patch
 *     guarded by --patch-collaborator-uids)
 *   - users.publicKey / users.encryptedPrivateKey (PGP refactor handles those)
 *   - presence / reminderSnoozes / eventReminders subcollections
 *
 * Safety guards (added 2026-05-04):
 *   - notes with missing/empty `data.uid` are SKIPPED entirely (we cannot
 *     identify the owner's wrap, so deleting any sharedKey risks locking the
 *     owner out). Counted in `notesSkippedMissingUid`.
 *   - notes already in the target state (sharedKeys=1 owner-only, no
 *     collaborators) are SKIPPED (idempotent re-run friendly). Counted in
 *     `notesSkippedAlreadyTarget`.
 *   - calendars with missing/empty `data.uid` are SKIPPED (same reason).
 *
 * Audit log:
 *   - During dry-run, the script ENUMERATES every uid that will lose access
 *     (collaborators removed + non-owner sharedKeys + non-owner subscribers)
 *     and prints them — no writes.
 *   - During --apply, the script ALSO writes
 *       audit_log/sharing_reset/affected/{uid} = { resetAt, reason: 'crypto-upgrade' }
 *     for each affected uid. The FE reads this to show a one-time post-reset
 *     toast at next login (separate task).
 *
 * USAGE:
 *   # Dry-run (default — prints what WOULD be deleted, no writes):
 *   export GOOGLE_APPLICATION_CREDENTIALS="/absolute/path/to/serviceAccountKey.json"
 *   node server/scripts/reset-sharing-links.js
 *
 *   # Apply (really deletes):
 *   node server/scripts/reset-sharing-links.js --apply
 *
 *   # Also patch parent note's `collaboratorUids` to [] (recommended):
 *   node server/scripts/reset-sharing-links.js --apply --patch-collaborator-uids
 *
 *   # Alternative credential source:
 *   node server/scripts/reset-sharing-links.js --service-account /path/to/key.json
 *
 * SAFETY:
 *   - REQUIRES that backup-sharing-links has been run BEFORE --apply.
 *     The script does NOT enforce this; it's the operator's responsibility
 *     (see docs/refactor/RF-02-sharing-reset.md).
 *   - All deletes are batched (max 400/batch) and logged per doc.
 *   - On error mid-run, partial deletes are NOT rolled back — re-run is
 *     idempotent (already-deleted docs are skipped).
 *
 * EXIT CODES:
 *   0 = success (including dry-run), 1 = error
 */

const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const PATCH_COLLAB_UIDS = args.includes('--patch-collaborator-uids');
const serviceAccountPath = (() => {
  const idx = args.indexOf('--service-account');
  return idx !== -1 ? args[idx + 1] : null;
})();

const BATCH_SIZE = 400;

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

/**
 * Helper: queue a delete on `batch`, flush if full.
 * Returns { batch, batchSize } updated state.
 */
const queueDelete = async (db, batch, batchSize, docRef) => {
  batch.delete(docRef);
  batchSize++;
  if (batchSize >= BATCH_SIZE) {
    if (APPLY) await batch.commit();
    return { batch: db.batch(), batchSize: 0 };
  }
  return { batch, batchSize };
};

const queueUpdate = async (db, batch, batchSize, docRef, payload) => {
  batch.update(docRef, payload);
  batchSize++;
  if (batchSize >= BATCH_SIZE) {
    if (APPLY) await batch.commit();
    return { batch: db.batch(), batchSize: 0 };
  }
  return { batch, batchSize };
};

const reset = async () => {
  const db = admin.firestore();

  console.log(APPLY ? '[APPLY MODE] Changes will be committed' : '[DRY-RUN MODE] No changes will be made');
  console.log(`patch-collaborator-uids: ${PATCH_COLLAB_UIDS ? 'YES' : 'NO'}\n`);

  let batch = db.batch();
  let batchSize = 0;

  let collabsDeleted = 0;
  let sharedKeysDeleted = 0;
  let sharedKeysKept = 0;
  let subsDeleted = 0;
  let subsKept = 0;
  let invitesDeleted = 0;
  let collabUidsPatched = 0;
  let notesSkippedAlreadyTarget = 0;
  let notesSkippedMissingUid = 0;
  // Set<uid> — every uid that LOSES access by this reset, deduped across
  // notes / calendars. Used to write audit_log/sharing_reset/affected/{uid}.
  const affectedUids = new Set();
  const now = Date.now();

  // ── notes: collaborators + sharedKeys ────────────────────────────────────
  console.log('Scanning notes...');
  const notesSnap = await db.collection('notes').get();
  console.log(`  total notes: ${notesSnap.size}\n`);

  for (const noteDoc of notesSnap.docs) {
    const noteId = noteDoc.id;
    const data = noteDoc.data();
    const ownerUid = data.uid;

    const collabSnap = await noteDoc.ref.collection('collaborators').get();
    const skSnap = await noteDoc.ref.collection('sharedKeys').get();

    // GUARD #1: missing/empty owner uid → SKIP entire note.
    // Without an owner uid we cannot tell which sharedKey wrap belongs to the
    // owner; deleting any of them could lock the owner out of their own data.
    if (!ownerUid || typeof ownerUid !== 'string' || ownerUid.trim() === '') {
      console.warn(
        `[SKIP] notes/${noteId} — missing/empty data.uid (collaborators=${collabSnap.size}, sharedKeys=${skSnap.size}). Will NOT touch sharedKeys/collaborators to avoid locking the owner out.`
      );
      notesSkippedMissingUid++;
      continue;
    }

    // GUARD #2: already in target state — exactly 1 sharedKey AND no
    // collaborators. Nothing to do for this note.
    if (skSnap.size === 1 && collabSnap.size === 0) {
      const onlyKey = skSnap.docs[0];
      if (onlyKey.id === ownerUid) {
        console.log(
          `[skip-target] notes/${noteId} — already in target state (sharedKeys=1 owner-only, collaborators=0)`
        );
        sharedKeysKept++;
        notesSkippedAlreadyTarget++;
        continue;
      }
      // Edge case: 1 sharedKey but it's NOT the owner's. Fall through to the
      // normal logic so we can delete the orphan and warn loudly.
      console.warn(
        `[WARN] notes/${noteId} — sharedKeys=1 but owner wrap missing (only key for uid=${onlyKey.id}). Will delete and leave note without owner wrap.`
      );
    }

    // Wipe collaborators wholesale.
    for (const c of collabSnap.docs) {
      console.log(`[del] notes/${noteId}/collaborators/${c.id}`);
      if (c.id !== ownerUid) affectedUids.add(c.id);
      ({ batch, batchSize } = await queueDelete(db, batch, batchSize, c.ref));
      collabsDeleted++;
    }

    // sharedKeys: keep only owner's wrap, delete the rest.
    for (const sk of skSnap.docs) {
      if (sk.id === ownerUid) {
        console.log(`[keep] notes/${noteId}/sharedKeys/${sk.id} (owner)`);
        sharedKeysKept++;
      } else {
        console.log(`[del] notes/${noteId}/sharedKeys/${sk.id}`);
        affectedUids.add(sk.id);
        ({ batch, batchSize } = await queueDelete(db, batch, batchSize, sk.ref));
        sharedKeysDeleted++;
      }
    }

    // Optional: also clear collaboratorUids on the parent doc so the FE
    // doesn't keep showing stale "shared with" UI before next save.
    if (PATCH_COLLAB_UIDS) {
      if (Array.isArray(data.collaboratorUids) && data.collaboratorUids.length > 0) {
        console.log(`[patch] notes/${noteId}.collaboratorUids → []`);
        ({ batch, batchSize } = await queueUpdate(db, batch, batchSize, noteDoc.ref, {
          collaboratorUids: [],
        }));
        collabUidsPatched++;
      }
    }
  }

  // ── calendars: subscribers ──────────────────────────────────────────────
  console.log('\nScanning calendars...');
  const calsSnap = await db.collection('calendars').get();
  console.log(`  total calendars: ${calsSnap.size}\n`);

  for (const calDoc of calsSnap.docs) {
    const calId = calDoc.id;
    const ownerUid = calDoc.data().uid;
    const subSnap = await calDoc.ref.collection('subscribers').get();

    if (!ownerUid || typeof ownerUid !== 'string' || ownerUid.trim() === '') {
      console.warn(
        `[SKIP] calendars/${calId} — missing/empty data.uid (subscribers=${subSnap.size}). Will NOT touch subscribers.`
      );
      continue;
    }

    for (const s of subSnap.docs) {
      if (s.id === ownerUid) {
        console.log(`[keep] calendars/${calId}/subscribers/${s.id} (owner)`);
        subsKept++;
      } else {
        console.log(`[del] calendars/${calId}/subscribers/${s.id}`);
        affectedUids.add(s.id);
        ({ batch, batchSize } = await queueDelete(db, batch, batchSize, s.ref));
        subsDeleted++;
      }
    }
  }

  // ── invites: alive only ─────────────────────────────────────────────────
  console.log('\nScanning invites...');
  const invitesSnap = await db.collection('invites').get();
  console.log(`  total invites: ${invitesSnap.size}\n`);
  for (const inv of invitesSnap.docs) {
    const d = inv.data();
    const alive = typeof d.expiresAt === 'number' && d.expiresAt > now;
    if (alive) {
      console.log(`[del] invites/${inv.id} (type=${d.type} expires=${new Date(d.expiresAt).toISOString()})`);
      ({ batch, batchSize } = await queueDelete(db, batch, batchSize, inv.ref));
      invitesDeleted++;
    }
  }

  // Final flush of delete/update batch (note + calendar + invite ops).
  if (batchSize > 0 && APPLY) {
    await batch.commit();
    batch = db.batch();
    batchSize = 0;
  }

  // ── audit_log/sharing_reset/affected/{uid} ───────────────────────────────
  // During dry-run we just LIST affected uids. During --apply we actually
  // write the audit docs so the FE can show a one-time toast at next login.
  const affectedList = [...affectedUids].sort();
  if (APPLY && affectedList.length > 0) {
    console.log(`\nWriting audit_log/sharing_reset/affected/{uid} for ${affectedList.length} users...`);
    const affectedColl = db
      .collection('audit_log')
      .doc('sharing_reset')
      .collection('affected');
    const resetAt = admin.firestore.FieldValue.serverTimestamp();
    for (const uid of affectedList) {
      const ref = affectedColl.doc(uid);
      batch.set(
        ref,
        { resetAt, reason: 'crypto-upgrade' },
        { merge: true }
      );
      batchSize++;
      if (batchSize >= BATCH_SIZE) {
        await batch.commit();
        batch = db.batch();
        batchSize = 0;
      }
    }
    if (batchSize > 0) {
      await batch.commit();
      batch = db.batch();
      batchSize = 0;
    }
  }

  // ── report ───────────────────────────────────────────────────────────────
  console.log('\n=== RESET SUMMARY ===');
  console.log(`collaborators ${APPLY ? 'deleted' : 'would-delete'}:        ${collabsDeleted}`);
  console.log(`sharedKeys    ${APPLY ? 'deleted' : 'would-delete'}:        ${sharedKeysDeleted}`);
  console.log(`sharedKeys    kept (owner wraps):     ${sharedKeysKept}`);
  console.log(`subscribers   ${APPLY ? 'deleted' : 'would-delete'}:        ${subsDeleted}`);
  console.log(`subscribers   kept (owner self-subs): ${subsKept}`);
  console.log(`invites alive ${APPLY ? 'deleted' : 'would-delete'}:        ${invitesDeleted}`);
  console.log(`notes skipped (already target state): ${notesSkippedAlreadyTarget}`);
  console.log(`notes skipped (missing/empty uid):    ${notesSkippedMissingUid}`);
  if (PATCH_COLLAB_UIDS) {
    console.log(`notes.collaboratorUids ${APPLY ? 'patched' : 'would-patch'}: ${collabUidsPatched}`);
  }

  console.log(`\nAffected users (lose access): ${affectedList.length}`);
  if (affectedList.length > 0) {
    affectedList.forEach((uid) => console.log(`  - ${uid}`));
    console.log(
      APPLY
        ? `\naudit_log/sharing_reset/affected/{uid} written for ${affectedList.length} users.`
        : `\n[DRY-RUN] audit_log/sharing_reset/affected/{uid} would be written for ${affectedList.length} users on --apply.`
    );
  }

  if (!APPLY) {
    console.log('\n[DRY-RUN] No writes performed. Re-run with --apply once backup is verified.');
  } else {
    console.log('\n[SUCCESS] Reset complete.');
  }
};

initializeFirebase();
reset()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n[ERROR] Reset failed:', err.message);
    process.exit(1);
  });
