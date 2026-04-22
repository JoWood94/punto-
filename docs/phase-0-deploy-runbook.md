# Fase 0 Deploy Runbook — Schema tipizzato + Rules strict + Migrazione

**Scopo**: introduzione silenziosa del discriminator `type` (+ `hasReminderBlock` denormalizzato, `cancelled`, `calendarId`, `image`) sui documenti `notes` senza impatto UX utente.

**Decisione architetturale chiave**: NIENTE passaggio intermedio "rules soft". Le rules attuali non validano già lo schema notes → il periodo "soft" è implicito. Un unico deploy di rules strict DOPO migrazione.

**Ordine deploy critico** (deviare = utenti bloccati):
1. Backup DB
2. Deploy FE tipizzato su **staging** (scrive `type` + `hasReminderBlock`; legge graceful)
3. Verifica staging
4. Migrazione `--dry-run` su prod DB
5. Migrazione `--live` su prod DB
6. Deploy rules strict + indexes
7. Smoke E2E qaClient su staging
8. Go Giuseppe test locale
9. Deploy FE a prod

---

## Prerequisiti

- [ ] `server/serviceAccountKey.json` presente (Firebase Console → Service Accounts → Generate private key)
- [ ] `firebase use punto-84646` corrente
- [ ] Team pronto: feDev ha pushato code `note.ts` + unit test verdi, webArchitect ha pushato rules/indexes/migrate script
- [ ] Baseline E2E suite qaClient verde (allowlist RF-01b pre-esistenti OK)

---

## Step 1 — Backup DB (prima di qualsiasi deploy)

```bash
cd /Users/giuseppebosco/Developer/punto
node server/scripts/backup-baseline-shared-calendars.js --service-account ./server/serviceAccountKey.json
```

**Output atteso**:
- File: `backups/baseline-YYYYMMDD-HHMMSS.json.gz`
- Count notes: `N`
- Count users: `M`
- SHA-256: `<hash>`

**Azione**: salvare i 3 valori (count notes, count users, SHA) come commento al Task #1. Questi sono i dati di riferimento per il check integrity di Task #9.

---

## Step 2 — Commit + Deploy FE tipizzato su STAGING

Le rules sono ancora permissive (non validano `type`) → questo deploy è sicuro: il FE inizia a scrivere `type` + `hasReminderBlock` sui nuovi save e gli utenti esistenti non si accorgono di nulla.

```bash
git add frontend/src/app/services/note.ts frontend/src/app/services/note.spec.ts
git commit -m "feat(phase-0): typed Note interface + hasReminderBlock denormalized"
git push origin develop
```

CI staging si triggerano automaticamente via workflow **`deploy-staging.yml`** (triggerato su push `develop`).

**Verifica post-deploy staging**:
- Apri staging URL
- Crea nota nuova → Firestore Console → doc deve avere `type: 'note'` + `hasReminderBlock: false`
- Crea memo (con ReminderBlock) → `type: 'memo'` + `hasReminderBlock: true`
- Apri una nota legacy (pre-migrazione) → deve aprirsi senza errori (mapping graceful `type ?? 'note'`)

Se una di queste non passa → STOP, non procedere al Step 3.

---

## Step 3 — Migrazione `--dry-run` su DB prod

Script idempotente: per ogni doc, se manca `type` lo deriva dai `blocks[]`, se manca solo `hasReminderBlock` fa backfill. Skippa doc già completi.

```bash
node server/scripts/migrate-notes-to-typed.js --dry-run --service-account ./server/serviceAccountKey.json
```

**Output atteso**:
```
=== DRY-RUN SUMMARY ===
Total docs:     N
Would migrate:  X    (manca type)
Would backfill: Y    (manca hasReminderBlock)
Would skip:     Z    (già completi)
Check:          X+Y+Z == N  ✓
```

**Azione**: verificare `X+Y+Z == N` e che `N` corrisponda al count del backup (Step 1). Se diverso → STOP, investigare.

---

## Step 4 — Migrazione `--live` su DB prod

```bash
node server/scripts/migrate-notes-to-typed.js --live --service-account ./server/serviceAccountKey.json
```

**Output atteso**: stesso summary ma con contatori reali (`Migrated`, `Backfilled`, `Skipped`, `Errors: 0`).

Se `Errors > 0` → STOP, raccogli gli id doc falliti e investiga prima di procedere al Step 5.

---

## Step 5 — Deploy rules strict + indexes

Ora che tutti i doc hanno `type` + `hasReminderBlock`, attiva le rules hard.

```bash
firebase deploy --only firestore:rules,firestore:indexes --project punto-84646
```

**Verifica post-deploy**:
- Firestore Console → Rules tab → nuove rules attive
- Prova (via console web) a creare doc senza `type` → deve fallire con "Permission denied"
- Prova a creare doc `type: 'note'` con `hasReminderBlock: true` → deve fallire

Indexes nuovi (`uid+type`, `calendarId+reminderTime`) appariranno in stato "Building" → attendere qualche minuto per completamento.

---

## Step 6 — Smoke E2E qaClient su staging

qaClient esegue `smoke-phase-0-typed.spec.ts` (attivato ora) + suite core esistente.

Target: verde al 100% su staging. Allowlist RF-01b pre-esistenti accettata ma documentata.

Se rosso non-allowlist → STOP, fix prima di prod.

---

## Step 7 — Go Giuseppe test locale

- Giuseppe apre staging in produzione, su iOS Safari + desktop
- Test manuale: login, lista note, crea/edit/delete, reminder, calendar
- Conferma "ok prod" al team lead

Nessun deploy prod senza questo go.

---

## Step 8 — Deploy FE a prod

Dopo conferma di Giuseppe:

```bash
# Auto via workflow su push a release_pages / main, oppure manuale:
firebase deploy --only hosting:prod --project punto-84646
```

Deploy paralleli su entrambi i target (Firebase Hosting + GitHub Pages) come da convenzione progetto.

---

## Rollback

**Scenario A — Problemi prima della migrazione (Step 4)**:
```bash
git revert <commit-phase-0>
git push origin develop
```
Nessun danno ai dati: i nuovi campi erano solo additivi.

**Scenario B — Migrazione ha corrotto dati (Step 4)**:
```bash
node server/scripts/restore-rf01b.js backups/baseline-YYYYMMDD-HHMMSS.json.gz --only-missing --apply
```
Ripristina campi mancanti da backup senza sovrascrivere edit successivi.

**Scenario C — Rules strict bloccano utenti (Step 5)**:
```bash
# Ripristina rules precedenti da git history
git checkout HEAD~1 firestore.rules
firebase deploy --only firestore:rules --project punto-84646
```

---

## Success Criteria (ref Task #9)

- [ ] Count notes pre/post migrazione invariato
- [ ] Spot-check 20 doc random: campi originali (uid, title, blocks, color, createdAt, ecc.) invariati
- [ ] Zero errori su write utenti attivi post rules strict
- [ ] Smoke E2E staging verde
- [ ] Test locale Giuseppe OK

---

## Owner

- **devOps**: Step 1, 3, 4, 5, 8
- **feDev**: Step 2 (commit + push), supporto su anomalie FE
- **webArchitect**: supporto su anomalie migrazione/rules
- **qaClient**: Step 6 smoke E2E + gestione ALLOWLIST-KNOWN-RED
- **Giuseppe**: Step 7 go finale
- **team-lead**: orchestrazione + rollback decision

**Durata stimata**: 30-45 min (escludendo attesa build indexes Firestore ~5-15 min in Step 5).
