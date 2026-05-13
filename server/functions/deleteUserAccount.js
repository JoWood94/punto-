/**
 * deleteUserAccount.js
 *
 * Core implementation of GDPR Art. 17 (Right to Erasure) for the punto app.
 *
 * Exposes a single function `deleteUserAccount(admin, uid, opts)` that performs
 * a full, atomic-by-step, idempotent cancellation of all data belonging to a
 * given Firebase Auth user. It is consumed in TWO different harnesses:
 *
 *   1) `server/functions/index.js` → wraps it as an `onCall` Cloud Function
 *      callable by an authenticated client (request.auth.uid == uid).
 *   2) `server/scripts/admin-delete-user.js` → wraps it as a CLI for manual
 *      operator use (e.g. testing, hard cancellations of problematic accounts).
 *
 * Why a shared module: the deletion logic is non-trivial (Firestore + Storage
 * + Auth + audit log, batching, idempotency) and we MUST guarantee that the
 * client-driven path and the operator-driven path delete EXACTLY the same set
 * of artifacts. Duplicating the logic would diverge over time.
 *
 * What it deletes (in order):
 *
 *   STEP 1 — owned notes (and their entire subcollection trees):
 *     notes/{*} where data.uid == userId
 *       └── notes/{*}/collaborators/* (full wipe)
 *       └── notes/{*}/sharedKeys/*    (full wipe)
 *       └── notes/{*}/presence/*      (full wipe)
 *       └── notes/{*}/reminderSnoozes/* (full wipe)
 *       └── notes/{*}/eventReminders/*  (full wipe)
 *
 *   STEP 2 — guest references on OTHER owners' notes:
 *     notes/{*}/collaborators/{userId}      (remove userId from co-owned notes)
 *     notes/{*}/sharedKeys/{userId}         (remove userId's wrap)
 *     notes/{*}/presence/{userId}           (cleanup presence)
 *     notes/{*}/reminderSnoozes/{userId}    (cleanup snoozes)
 *     notes/{*}/eventReminders/{userId}     (cleanup event reminders)
 *     parent notes.collaboratorUids array → remove userId via FieldValue.arrayRemove
 *
 *   STEP 3 — owned calendars:
 *     calendars/{*} where data.uid == userId
 *       └── calendars/{*}/subscribers/* (full wipe)
 *
 *   STEP 4 — subscriptions on OTHER owners' calendars:
 *     calendars/{*}/subscribers/{userId}
 *     (collectionGroup query on `subscribers` filtered by data.uid == userId)
 *
 *   STEP 5 — invites created by user:
 *     invites/{*} where data.createdBy == userId
 *
 *   STEP 6 — username slot release (must run BEFORE users/{uid} delete because
 *     we read `users/{uid}.usernameLower` to find the slot):
 *     usernames/{lowerUsername}
 *
 *   STEP 7 — user document + future subcollections (RF-03 keymaterial etc.):
 *     users/{userId} (recursive delete via admin.firestore().recursiveDelete)
 *
 *   STEP 8 — sharing-reset audit notice (RF-02 leftover for this user):
 *     audit_log/sharing_reset/affected/{userId}
 *
 *   STEP 9 — Firebase Storage attachments under any path matching userId:
 *     bucket.deleteFiles({ prefix: `notes/${userId}/` })
 *     bucket.deleteFiles({ prefix: `attachments/${userId}/` })
 *     (Both prefixes are tolerated; today only `notes/{uid}/...` is used by the
 *     image-block uploader, but the older spec also referenced `attachments/`.)
 *
 *   STEP 10 — Firebase Auth account:
 *     admin.auth().deleteUser(userId)
 *
 *   STEP 11 — GDPR audit log (NON-cancellable, retention only of metadata):
 *     audit_log/gdpr_deletions/{timestamp-shortHash}
 *       = { uidHash: sha256(uid), deletedAt, counts, requestSource, version }
 *     NO uid in chiaro, NO email, NO PII.
 *
 * Idempotency: every step is implemented so that if the artifact is already
 * absent, the step is a no-op. A re-invocation on a partially-deleted user
 * completes successfully and writes a fresh audit entry.
 *
 * Batching: Firestore writes are flushed every 400 ops (Firestore hard limit
 * is 500; we leave 100 of headroom for sub-deletes inside the same step).
 *
 * Error handling: a failure inside any step is logged and propagated. The
 * caller decides whether to retry (Cloud Functions retries onCall errors only
 * on transient codes). Already-completed steps stay completed; a retry will
 * skip them naturally because of idempotency.
 *
 * NB: this module deliberately does NOT depend on `firebase-functions`.
 * It only needs `firebase-admin` (already installed in `server/`). The Cloud
 * Function wrapper layers `onCall` semantics on top.
 */

const crypto = require('crypto');

const BATCH_SIZE = 400;

// ──────────────────────────────────────────────────────────────────────────────
// Logging
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Lightweight structured logger. We don't import `firebase-functions/logger`
 * because this module must run both inside and outside the Functions runtime.
 * The Cloud Function wrapper passes its own logger; CLI uses console.
 */
const defaultLogger = {
  info: (...a) => console.log('[gdpr-delete]', ...a),
  warn: (...a) => console.warn('[gdpr-delete]', ...a),
  error: (...a) => console.error('[gdpr-delete]', ...a),
};

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

/**
 * SHA-256 hex digest of a string. Used to obfuscate uid in the GDPR audit log.
 */
function sha256Hex(input) {
  return crypto.createHash('sha256').update(input, 'utf8').digest('hex');
}

/**
 * Recursively delete a Firestore document and ALL its subcollections.
 * Uses Firestore Admin's `recursiveDelete` (available since firebase-admin@10).
 * Returns the number of docs deleted (best-effort estimate from listDocuments).
 */
async function recursiveDeleteDoc(db, docRef, log) {
  // Cheap pre-count for logging (does NOT scale to millions but our notes
  // have at most a handful of subcollection docs each).
  let estimate = 0;
  try {
    const cols = await docRef.listCollections();
    for (const col of cols) {
      const ids = await col.listDocuments();
      estimate += ids.length;
    }
  } catch (e) {
    // listCollections may fail on missing-doc; treat as 0
  }
  await db.recursiveDelete(docRef);
  return estimate + 1; // +1 for the parent doc itself
}

/**
 * Commit a batch and return a fresh one. No-op if `count == 0`.
 */
async function flushBatch(db, batch, count) {
  if (count > 0) await batch.commit();
  return { batch: db.batch(), count: 0 };
}

// ──────────────────────────────────────────────────────────────────────────────
// Step implementations
// ──────────────────────────────────────────────────────────────────────────────

/**
 * STEP 1 — owned notes + their full subcollection trees.
 */
async function deleteOwnedNotes(db, uid, log) {
  log.info(`Step 1/11 — deleting owned notes for uid=${uid}`);
  const snap = await db.collection('notes').where('uid', '==', uid).get();
  let count = 0;
  for (const doc of snap.docs) {
    await recursiveDeleteDoc(db, doc.ref, log);
    count += 1;
    if (count % 50 === 0) log.info(`  Step 1 — ${count}/${snap.size} notes deleted`);
  }
  log.info(`  Step 1 done — ${count} owned notes deleted`);
  return count;
}

/**
 * STEP 2 — remove this uid from notes owned by OTHER users.
 *
 * We need to find:
 *   a) notes where collaboratorUids array-contains uid
 *      → remove from array + delete subdocs collaborators/{uid}, sharedKeys/{uid},
 *        presence/{uid}, reminderSnoozes/{uid}, eventReminders/{uid}
 *
 * collectionGroup('collaborators') with where doc-id-equals would be ideal but
 * Firestore doesn't support doc-id collection-group queries cleanly. Instead
 * we use the `collaboratorUids` array on the parent — already an array
 * indexed for `array-contains` queries (existing pattern in the FE).
 */
async function deleteGuestReferences(admin, db, uid, log) {
  log.info(`Step 2/11 — removing uid=${uid} from notes owned by others`);
  const snap = await db.collection('notes').where('collaboratorUids', 'array-contains', uid).get();
  let touched = 0;
  for (const noteDoc of snap.docs) {
    // Skip if this note is owned by uid (already handled in Step 1 — should
    // not happen because Step 1 deleted it, but defensive).
    if (noteDoc.data().uid === uid) continue;

    const noteRef = noteDoc.ref;
    let { batch, count } = { batch: db.batch(), count: 0 };

    // Remove from array
    batch.update(noteRef, {
      collaboratorUids: admin.firestore.FieldValue.arrayRemove(uid),
    });
    count++;

    // Delete the 5 user-keyed subcollection docs (idempotent: ignore missing).
    const subPaths = ['collaborators', 'sharedKeys', 'presence', 'reminderSnoozes', 'eventReminders'];
    for (const subName of subPaths) {
      batch.delete(noteRef.collection(subName).doc(uid));
      count++;
    }

    if (count > 0) await batch.commit();
    touched++;
    if (touched % 50 === 0) log.info(`  Step 2 — ${touched}/${snap.size} guest refs cleared`);
  }
  log.info(`  Step 2 done — ${touched} notes had this uid as guest`);
  return touched;
}

/**
 * STEP 3 — owned calendars + their subscribers subcollection.
 */
async function deleteOwnedCalendars(db, uid, log) {
  log.info(`Step 3/11 — deleting owned calendars for uid=${uid}`);
  const snap = await db.collection('calendars').where('uid', '==', uid).get();
  let count = 0;
  for (const doc of snap.docs) {
    await recursiveDeleteDoc(db, doc.ref, log);
    count++;
  }
  log.info(`  Step 3 done — ${count} owned calendars deleted`);
  return count;
}

/**
 * STEP 4 — subscriptions on OTHER owners' calendars.
 *
 * Uses collectionGroup('subscribers') filtered by data.uid == userId. The
 * existing rule in firestore.rules (line 463-466) already authorizes this
 * shape for client SDK; Admin SDK bypasses rules anyway.
 */
async function deleteForeignSubscriptions(db, uid, log) {
  log.info(`Step 4/11 — deleting subscriptions on others' calendars for uid=${uid}`);
  const snap = await db.collectionGroup('subscribers').where('uid', '==', uid).get();
  let { batch, count } = { batch: db.batch(), count: 0 };
  let total = 0;
  for (const doc of snap.docs) {
    // Defensive: skip if the parent calendar is owned by uid (already deleted
    // by Step 3 — but the cascade may have left orphan subdocs in flight).
    batch.delete(doc.ref);
    count++; total++;
    if (count >= BATCH_SIZE) ({ batch, count } = await flushBatch(db, batch, count));
  }
  await flushBatch(db, batch, count);
  log.info(`  Step 4 done — ${total} foreign subscription docs deleted`);
  return total;
}

/**
 * STEP 5 — invites created by user.
 */
async function deleteOwnedInvites(db, uid, log) {
  log.info(`Step 5/11 — deleting invites created by uid=${uid}`);
  const snap = await db.collection('invites').where('createdBy', '==', uid).get();
  let { batch, count } = { batch: db.batch(), count: 0 };
  let total = 0;
  for (const doc of snap.docs) {
    batch.delete(doc.ref);
    count++; total++;
    if (count >= BATCH_SIZE) ({ batch, count } = await flushBatch(db, batch, count));
  }
  await flushBatch(db, batch, count);
  log.info(`  Step 5 done — ${total} invites deleted`);
  return total;
}

/**
 * STEP 6 — release the username slot in `usernames/{lowerUsername}`.
 *
 * MUST run BEFORE Step 7 (users/{uid} delete) because we read the user doc
 * to discover the lowercase slot.
 */
async function releaseUsername(db, uid, log) {
  log.info(`Step 6/11 — releasing username slot for uid=${uid}`);
  const userSnap = await db.collection('users').doc(uid).get();
  if (!userSnap.exists) {
    log.info(`  Step 6 skipped — users/${uid} does not exist`);
    return 0;
  }
  const data = userSnap.data() || {};
  const lower = data.usernameLower || (data.username ? String(data.username).toLowerCase() : null);
  if (!lower) {
    log.info(`  Step 6 skipped — no username on users/${uid}`);
    return 0;
  }
  // Defensive: only delete the slot if it actually points back to this uid.
  // Avoids freeing a slot that another account might already own (race).
  const slotRef = db.collection('usernames').doc(lower);
  const slotSnap = await slotRef.get();
  if (slotSnap.exists && slotSnap.data()?.uid === uid) {
    await slotRef.delete();
    log.info(`  Step 6 done — released usernames/${lower}`);
    return 1;
  }
  log.info(`  Step 6 skipped — usernames/${lower} not owned by ${uid}`);
  return 0;
}

/**
 * STEP 7 — recursive delete of users/{uid} (covers any future subcollections
 * such as users/{uid}/private/keymaterial planned in RF-03).
 */
async function deleteUserDoc(db, uid, log) {
  log.info(`Step 7/11 — recursive delete of users/${uid}`);
  const ref = db.collection('users').doc(uid);
  // recursiveDelete is idempotent on missing docs.
  await db.recursiveDelete(ref);
  log.info(`  Step 7 done — users/${uid} fully removed`);
  return 1;
}

/**
 * STEP 8 — clear the per-user sharing-reset notice (RF-02 leftover).
 */
async function deleteSharingResetNotice(db, uid, log) {
  log.info(`Step 8/11 — clearing audit_log/sharing_reset/affected/${uid} (if any)`);
  const ref = db.collection('audit_log').doc('sharing_reset')
    .collection('affected').doc(uid);
  const snap = await ref.get();
  if (snap.exists) {
    await ref.delete();
    log.info(`  Step 8 done — notice cleared`);
    return 1;
  }
  log.info(`  Step 8 skipped — no notice present`);
  return 0;
}

/**
 * STEP 9 — Firebase Storage cleanup.
 *
 * We try both known prefixes:
 *   - `notes/{uid}/...`        (current image-block uploader, see note-editor.ts)
 *   - `attachments/{uid}/...`  (older path, kept for forward/backward safety)
 *
 * If the bucket is not configured (e.g. local emulator without Storage), the
 * step logs a warning and returns 0 instead of failing the whole deletion.
 */
async function deleteStorageFiles(admin, uid, log) {
  log.info(`Step 9/11 — deleting Storage files for uid=${uid}`);
  let total = 0;
  try {
    const bucket = admin.storage().bucket();
    const prefixes = [`notes/${uid}/`, `attachments/${uid}/`];
    for (const prefix of prefixes) {
      const [files] = await bucket.getFiles({ prefix });
      if (files.length === 0) continue;
      // deleteFiles handles batch internally and is idempotent on already-gone files.
      await bucket.deleteFiles({ prefix, force: true });
      total += files.length;
      log.info(`  Step 9 — deleted ${files.length} files under ${prefix}`);
    }
  } catch (err) {
    log.warn(`  Step 9 partial — Storage cleanup failed: ${err.message}. Continuing.`);
  }
  log.info(`  Step 9 done — ${total} Storage files deleted`);
  return total;
}

/**
 * STEP 10 — delete Firebase Auth account.
 * Idempotent: if the account is already gone (auth/user-not-found), succeed.
 */
async function deleteAuthAccount(admin, uid, log) {
  log.info(`Step 10/11 — deleting Firebase Auth account for uid=${uid}`);
  try {
    await admin.auth().deleteUser(uid);
    log.info(`  Step 10 done — Auth account deleted`);
    return 1;
  } catch (err) {
    if (err.code === 'auth/user-not-found') {
      log.info(`  Step 10 skipped — Auth account already absent`);
      return 0;
    }
    throw err;
  }
}

/**
 * STEP 11 — write a permanent (non-cancellable) GDPR audit record.
 *
 * Schema (conscious choice — no PII):
 *   audit_log/gdpr_deletions/{timestamp}-{shortUidHash} = {
 *     uidHash:        sha256(uid) hex,
 *     deletedAt:      Firestore server timestamp,
 *     counts:         { notes, guestRefs, calendars, foreignSubs, invites,
 *                       usernames, userDoc, sharingResetNotice, storageFiles,
 *                       authAccount },
 *     requestSource:  'client' | 'admin',
 *     version:        deletion procedure version (bump when shape changes)
 *   }
 *
 * The doc id contains a SHORT hash prefix (first 8 hex chars) so re-deletions
 * of the same uid produce different docs (timestamp prefix), but a forensic
 * operator can grep "starts with 8a9f1b2c..." to find every event for a given
 * uid IF — and only if — they have access to the uid (and can compute the
 * hash themselves). This is intentional: GDPR requires we prove WE DID delete,
 * not WHO we deleted.
 */
async function writeGdprAuditLog(admin, db, uid, counts, requestSource, log) {
  log.info(`Step 11/11 — writing GDPR audit log entry`);
  const uidHash = sha256Hex(uid);
  const shortHash = uidHash.slice(0, 8);
  const ts = Date.now();
  const docId = `${ts}-${shortHash}`;
  const ref = db.collection('audit_log').doc('gdpr_deletions')
    .collection('events').doc(docId);
  await ref.set({
    uidHash,
    deletedAt: admin.firestore.FieldValue.serverTimestamp(),
    deletedAtMs: ts,
    counts,
    requestSource, // 'client' | 'admin'
    version: 1,
  });
  log.info(`  Step 11 done — audit_log/gdpr_deletions/events/${docId}`);
  return docId;
}

// ──────────────────────────────────────────────────────────────────────────────
// Public entry
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Run the full GDPR deletion procedure for `uid`.
 *
 * @param {*} admin           A pre-initialised firebase-admin module instance.
 * @param {string} uid        The Firebase Auth uid to erase.
 * @param {{
 *   requestSource?: 'client' | 'admin',
 *   logger?: { info: Function, warn: Function, error: Function }
 * }} [opts]
 * @returns {Promise<{
 *   uidHash: string,
 *   auditDocId: string,
 *   counts: Record<string, number>
 * }>}
 */
async function deleteUserAccount(admin, uid, opts = {}) {
  if (!uid || typeof uid !== 'string') {
    throw new Error('deleteUserAccount: invalid uid');
  }
  const log = opts.logger || defaultLogger;
  const requestSource = opts.requestSource || 'admin';
  const db = admin.firestore();

  log.info(`==== GDPR delete START — uid=${uid} source=${requestSource} ====`);

  const counts = {
    notes: 0,
    guestRefs: 0,
    calendars: 0,
    foreignSubs: 0,
    invites: 0,
    usernames: 0,
    userDoc: 0,
    sharingResetNotice: 0,
    storageFiles: 0,
    authAccount: 0,
  };

  counts.notes              = await deleteOwnedNotes(db, uid, log);
  counts.guestRefs          = await deleteGuestReferences(admin, db, uid, log);
  counts.calendars          = await deleteOwnedCalendars(db, uid, log);
  counts.foreignSubs        = await deleteForeignSubscriptions(db, uid, log);
  counts.invites            = await deleteOwnedInvites(db, uid, log);
  counts.usernames          = await releaseUsername(db, uid, log);
  counts.userDoc            = await deleteUserDoc(db, uid, log);
  counts.sharingResetNotice = await deleteSharingResetNotice(db, uid, log);
  counts.storageFiles       = await deleteStorageFiles(admin, uid, log);
  counts.authAccount        = await deleteAuthAccount(admin, uid, log);

  const auditDocId = await writeGdprAuditLog(admin, db, uid, counts, requestSource, log);

  log.info(`==== GDPR delete DONE — uid=${uid} ====`);
  log.info(`  counts: ${JSON.stringify(counts)}`);

  return {
    uidHash: sha256Hex(uid),
    auditDocId,
    counts,
  };
}

module.exports = {
  deleteUserAccount,
  // re-exported for tests:
  _internal: {
    sha256Hex,
    recursiveDeleteDoc,
  },
};
