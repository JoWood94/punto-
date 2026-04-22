#!/usr/bin/env node

/**
 * migrate-notes-to-typed.js
 *
 * Script idempotente per Fase 0 shared-calendars.md — tipizzazione notes.
 * Aggiunge `type` ('note' | 'memo') e `hasReminderBlock` (boolean) ai doc legacy.
 * Il terzo tipo 'event' arriva solo in Fase 3 (niente da migrare lato script).
 *
 * ORDINE DEPLOY Fase 0 (pinnato da team-lead):
 *   1. Baseline backup DB  (devOps — script dedicato)
 *   2. Deploy FE tipizzato (scrive type + hasReminderBlock per doc nuovi)
 *   3. Dry-run migrazione  (questo script, default)
 *   4. Live migrazione     (questo script con --live)
 *   5. Deploy rules strict + firestore.indexes.json
 *
 * USAGE:
 *   # Dry-run (default — NESSUNA scrittura)
 *   export GOOGLE_APPLICATION_CREDENTIALS="/path/to/serviceAccountKey.json"
 *   node server/scripts/migrate-notes-to-typed.js
 *
 *   # Live (conferma esplicita richiesta)
 *   node server/scripts/migrate-notes-to-typed.js --live
 *
 *   # Oppure passando il service account via flag:
 *   node server/scripts/migrate-notes-to-typed.js --service-account /path/to/key.json --live
 *
 * LOGICA per ogni doc (transaction per-doc, race-safe contro write concorrenti):
 *   - Manca `type` (doc legacy):
 *       hasReminder = (blocks||[]).some(b => b.type === 'reminder')
 *       set { type: hasReminder ? 'memo' : 'note', hasReminderBlock: hasReminder }
 *       → counter: migrated
 *   - Presente `type` ma manca `hasReminderBlock` (gap doc creati da FE pre-flag):
 *       set { hasReminderBlock: derivato da blocks }
 *       → counter: backfilled
 *   - Entrambi presenti:
 *       no-op
 *       → counter: skipped
 *
 * IDEMPOTENTE: rieseguire dà stats con migrated=0 backfilled=0 skipped=total.
 *
 * INVARIANT: migrated + backfilled + skipped + errors == total.
 * Violazione → exit 1.
 *
 * EXIT CODES:
 *   0 = success (dry-run o live senza errori)
 *   1 = errore auth/connessione o invariant violata
 */

const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

const args = process.argv.slice(2);
const serviceAccountPath = (() => {
  const idx = args.indexOf('--service-account');
  return idx !== -1 ? args[idx + 1] : null;
})();
const LIVE = args.includes('--live');
const DRY_RUN = !LIVE;

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
 * Determina se un doc rappresenta un promemoria (memo) considerando TUTTI i
 * segnali disponibili. Critico perché i doc sono E2E-encrypted: `blocks` viene
 * serializzato come string PGP, quindi non è ispezionabile lato server.
 * I campi `reminderTime` e `reminderStatus` sono invece top-level NON cifrati
 * (vedi note.ts: `cryptoService.encryptNote` NON li include nei campi cifrati).
 */
function isReminder(data) {
  // 1) Blocks non cifrati (doc in chiaro o non E2E-enabled)
  if (Array.isArray(data.blocks) && data.blocks.some((b) => b && b.type === 'reminder')) {
    return true;
  }
  // 2) Flat fields top-level — funzionano anche per doc cifrati
  if (typeof data.reminderTime === 'number' && data.reminderTime > 0) return true;
  if (typeof data.reminderStatus === 'string' && data.reminderStatus.length > 0) return true;
  return false;
}

/**
 * Classifica un doc in base alla presenza e coerenza di `type` + `hasReminderBlock`.
 *
 * Esiti possibili:
 *   - 'full'     : manca `type` → migrazione completa (deriva type + flag)
 *   - 'backfill' : type presente ma `hasReminderBlock` assente/errato → aggiorna il flag
 *   - 'fix'      : inconsistenza semantica (type='note' ma isReminder(data)==true) → promuovi a 'memo'
 *   - 'skipped'  : doc già coerente (type + flag corretti)
 */
function classify(data) {
  const hasType = typeof data.type === 'string';
  if (!hasType) return 'full';

  const actual = isReminder(data);

  // Inconsistenza grave: type='note' ma il doc contiene un reminder reale.
  // Tipico di doc creati dal FE Fase 0 prima del fix auto-promozione note→memo.
  if (data.type === 'note' && actual) return 'fix';

  const flag = data.hasReminderBlock;
  const flagCorrect = typeof flag === 'boolean' && flag === actual;
  if (!flagCorrect) return 'backfill';

  return 'skipped';
}

async function migrate() {
  const db = admin.firestore();
  console.log(`[${new Date().toISOString()}] migrate-notes-to-typed (${DRY_RUN ? 'DRY-RUN' : 'LIVE'})`);
  console.log('Fetching all notes from Firestore...');
  const snapshot = await db.collection('notes').get();
  const total = snapshot.size;
  console.log(`Total docs: ${total}\n`);

  const counters = { total, migrated: 0, backfilled: 0, fixed: 0, skipped: 0, errors: 0 };
  const errorLog = [];
  const fixedLog = [];
  const typeDistribution = { note: 0, memo: 0, event: 0, legacy_untyped: 0 };

  let processed = 0;
  for (const doc of snapshot.docs) {
    processed++;
    try {
      // Transaction per-doc: race-safe se l'utente scrive durante la migrazione.
      // Costo accettabile: con ~12 utenti il totale docs è piccolo, e Firestore
      // txn è cheap per read+update atomico di un singolo doc.
      await db.runTransaction(async (tx) => {
        const fresh = await tx.get(doc.ref);
        if (!fresh.exists) {
          // Doc eliminato tra la query iniziale e la txn: non è un errore,
          // registra come skipped.
          counters.skipped++;
          return;
        }
        const data = fresh.data();
        const klass = classify(data);
        const hasReminder = isReminder(data);

        // Tracking distribuzione tipi (post-migration projected).
        const finalType = klass === 'fix'
          ? 'memo'                                   // sarà riclassificato
          : (data.type || (hasReminder ? 'memo' : 'note'));
        if (finalType in typeDistribution) typeDistribution[finalType]++;
        else typeDistribution.legacy_untyped++;

        if (klass === 'skipped') {
          counters.skipped++;
          return;
        }

        if (klass === 'full') {
          const newType = hasReminder ? 'memo' : 'note';
          if (!DRY_RUN) {
            tx.update(doc.ref, {
              type: newType,
              hasReminderBlock: hasReminder,
            });
          }
          counters.migrated++;
          return;
        }

        if (klass === 'backfill') {
          if (!DRY_RUN) {
            tx.update(doc.ref, { hasReminderBlock: hasReminder });
          }
          counters.backfilled++;
          return;
        }

        if (klass === 'fix') {
          // Doc con type='note' ma contiene reminder reale → promuovi a 'memo'
          fixedLog.push({
            id: doc.id,
            prevType: data.type,
            prevFlag: data.hasReminderBlock,
            reason: 'type=note con reminder reale — promosso a memo',
          });
          if (!DRY_RUN) {
            tx.update(doc.ref, {
              type: 'memo',
              hasReminderBlock: true,
            });
          }
          counters.fixed++;
          return;
        }
      });
    } catch (err) {
      counters.errors++;
      errorLog.push({ id: doc.id, error: err.message });
      console.error(`[ERROR] doc ${doc.id}: ${err.message}`);
    }

    if (processed % 100 === 0) {
      console.log(`  ...processed ${processed}/${total}`);
    }
  }

  const invariantSum =
    counters.migrated + counters.backfilled + counters.fixed + counters.skipped + counters.errors;
  const invariantOk = invariantSum === counters.total;

  console.log('\n=== MIGRATION SUMMARY ===');
  console.log(`Mode:            ${DRY_RUN ? 'DRY-RUN (no writes)' : 'LIVE'}`);
  console.log(`Total:           ${counters.total}`);
  console.log(`Migrated (full): ${counters.migrated}    (set type + hasReminderBlock)`);
  console.log(`Backfilled:      ${counters.backfilled}    (flag corretto/aggiunto)`);
  console.log(`Fixed:           ${counters.fixed}    (type='note' con reminder → promosso a 'memo')`);
  console.log(`Skipped:         ${counters.skipped}    (già coerente)`);
  console.log(`Errors:          ${counters.errors}`);
  console.log(`Invariant:       ${invariantOk ? 'OK' : 'FAIL'}  (sum=${invariantSum}, total=${counters.total})`);

  if (fixedLog.length > 0) {
    console.log('\nFixed docs (inconsistenze corrette):');
    fixedLog.forEach((e) => console.log(`  - ${e.id}: ${e.reason} (era type=${e.prevType}, flag=${e.prevFlag})`));
  }

  console.log('\nType distribution (post-migration projected):');
  console.log(`  note:            ${typeDistribution.note}`);
  console.log(`  memo:            ${typeDistribution.memo}`);
  console.log(`  event:           ${typeDistribution.event}  (introdotto in Fase 3)`);
  if (typeDistribution.legacy_untyped > 0) {
    console.log(`  legacy_untyped:  ${typeDistribution.legacy_untyped}  (type fuori whitelist!)`);
  }

  if (errorLog.length > 0) {
    console.log('\nFirst 10 errors:');
    errorLog.slice(0, 10).forEach((e) => console.log(`  - ${e.id}: ${e.error}`));
  }

  if (!invariantOk || counters.errors > 0) {
    console.error('\n[FAIL] Migration completed with issues. Review errors before retry.');
    process.exit(1);
  }

  if (DRY_RUN) {
    console.log('\n[DRY-RUN] Nessuna scrittura effettuata.');
    console.log('Per applicare: rieseguire con --live.');
  } else {
    console.log('\n[SUCCESS] Migrazione applicata.');
    console.log('Next: verifica spot-check (20 doc random) + deploy rules strict + indexes.');
  }
}

initializeFirebase();
migrate()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n[ERROR] Migration failed:', err.message);
    process.exit(1);
  });
