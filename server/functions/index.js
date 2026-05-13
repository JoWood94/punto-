/**
 * server/functions/index.js
 *
 * Cloud Functions entry point for the punto app.
 *
 * Currently exposes:
 *
 *   deleteUserAccount  — onCall (Gen 2), authenticated, region: europe-west1
 *                        Implements GDPR Art. 17 (Right to Erasure).
 *
 * IMPORTANT — DEPLOYMENT (NOT done in this commit):
 *
 *   1. Add a `functions` block to /firebase.json:
 *        "functions": [{ "source": "server/functions", "codebase": "default" }]
 *   2. From server/functions/: `npm install`
 *   3. Test locally with the Firebase emulator: `firebase emulators:start --only functions,firestore,auth`
 *   4. Deploy: `firebase deploy --only functions:deleteUserAccount`
 *
 * The procedure is invoked from the client via:
 *
 *   import { getFunctions, httpsCallable } from 'firebase/functions';
 *   const functions = getFunctions(getApp(), 'europe-west1');
 *   const fn = httpsCallable(functions, 'deleteUserAccount');
 *   const result = await fn();
 *   // result.data = { ok: true, auditDocId, counts, uidHash }
 *
 * Region note: 'europe-west1' aligns with the existing Firestore region
 * (Frankfurt is the default for new EU projects). Confirm with
 * `gcloud firestore databases describe` before first deploy if unsure.
 */

const admin = require('firebase-admin');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { logger } = require('firebase-functions/v2');

const { deleteUserAccount } = require('./deleteUserAccount');

// Initialise Admin SDK exactly once.
if (admin.apps.length === 0) {
  admin.initializeApp();
}

// ──────────────────────────────────────────────────────────────────────────────
// deleteUserAccount — onCall
// ──────────────────────────────────────────────────────────────────────────────
//
//   Auth:        REQUIRED — request.auth.uid is the only allowed target.
//                We deliberately do NOT accept a `uid` parameter from the
//                payload; a user can ONLY delete their own account via this
//                callable. Operator-driven deletions go through the admin CLI.
//
//   Idempotent:  YES — re-invocations on already-deleted users complete fine
//                and write a fresh audit entry.
//
//   Timeout:     540s (max for Gen 2 onCall) — needed because users with
//                many notes + Storage files take time. Most deletions complete
//                in <30s.
//
//   Memory:      512 MiB — the deletion holds little state in RAM (it streams
//                Firestore queries) but the Storage SDK pre-list can buffer
//                a few thousand file metadata. 256 MiB is borderline, 512
//                gives margin.
//
//   Concurrency: keep default (80). The function does heavy I/O, not CPU.
//
//   Region:      europe-west1 (must match Firestore region).

exports.deleteUserAccount = onCall(
  {
    region: 'europe-west1',
    timeoutSeconds: 540,
    memory: '512MiB',
    // No CORS / origin restriction needed — onCall validates Firebase Auth
    // ID tokens and bypasses the public callable surface.
  },
  async (request) => {
    // 1. Auth check — must be a signed-in user.
    if (!request.auth || !request.auth.uid) {
      throw new HttpsError(
        'unauthenticated',
        'You must be signed in to delete your account.'
      );
    }

    const uid = request.auth.uid;

    // 2. Optional payload validation. Currently the callable accepts NO
    //    parameters — the uid is taken EXCLUSIVELY from request.auth.uid.
    //    If a future revision adds eg. `confirmationToken`, validate here.
    if (request.data && request.data.uid && request.data.uid !== uid) {
      throw new HttpsError(
        'permission-denied',
        'You can only delete your own account.'
      );
    }

    logger.info('deleteUserAccount: start', { uid });

    try {
      const result = await deleteUserAccount(admin, uid, {
        requestSource: 'client',
        logger: {
          info: (...a) => logger.info(a.join(' ')),
          warn: (...a) => logger.warn(a.join(' ')),
          error: (...a) => logger.error(a.join(' ')),
        },
      });

      logger.info('deleteUserAccount: success', {
        uidHash: result.uidHash,
        auditDocId: result.auditDocId,
        counts: result.counts,
      });

      return {
        ok: true,
        auditDocId: result.auditDocId,
        uidHash: result.uidHash,
        counts: result.counts,
      };
    } catch (err) {
      logger.error('deleteUserAccount: failure', {
        uid,
        message: err.message,
        stack: err.stack,
      });
      // Surface a generic error to the client. The detailed cause is in logs.
      throw new HttpsError(
        'internal',
        'Account deletion failed. Some data may have been deleted; please contact support.',
        { hint: err.message }
      );
    }
  }
);
