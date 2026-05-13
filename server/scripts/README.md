# server/scripts — RF-01b operational scripts

Scripts for the RF-01b legacy-field cleanup on the Firestore `notes` collection.

Three scripts form a safe pipeline:

1. **`backup-rf01b.js`** — local gzipped JSON snapshot of all `notes` docs.
2. **`cleanup-rf01b.js`** — dry-run and `--apply` removal of legacy fields.
3. **`restore-rf01b.js`** — rollback from a backup file.

> Firebase project `punto-84646` is on the **Spark plan** — `gcloud firestore export`
> is not available (requires GCS bucket + billing). These scripts replace that path
> with local backups.

## Full operational flow

```bash
# 0. Credentials once per shell
export GOOGLE_APPLICATION_CREDENTIALS="/absolute/path/to/serviceAccountKey.json"
cd /path/to/punto   # run from repo root so ./backups/ lands here

# 1. Backup (writes backups/notes-rf01b-YYYYMMDD-HHMMSS.json.gz)
node server/scripts/backup-rf01b.js
# → note SHA-256 printed at the end

# 2. Dry-run cleanup — review the field counts
node server/scripts/cleanup-rf01b.js

# 3. Apply cleanup (only after reviewing step 2)
node server/scripts/cleanup-rf01b.js --apply

# 4. Spot-check 3–5 notes in the Firebase Console
#    → legacy fields should be gone.

# 5. (Rollback only if needed) restore from the backup taken in step 1
node server/scripts/restore-rf01b.js backups/notes-rf01b-YYYYMMDD-HHMMSS.json.gz --only-missing          # dry-run
node server/scripts/restore-rf01b.js backups/notes-rf01b-YYYYMMDD-HHMMSS.json.gz --only-missing --apply  # execute
```

## Credentials

All three scripts resolve credentials in this order:

1. `--service-account /path/to/key.json` CLI flag
2. `GOOGLE_APPLICATION_CREDENTIALS` env var
3. `gcloud auth application-default login`

## Script reference

### `backup-rf01b.js`

Fetches every doc in `notes`, writes a gzipped JSON array of `{ id, data }`
into `./backups/` (relative to cwd). Prints:

- total doc count
- per-field count for the 6 legacy fields (`content`, `lastCompletedAt`,
  `address`, `lat`, `lon`, `checklist`) — compare with the dry-run of
  `cleanup-rf01b.js` as a sanity check
- backup file path
- SHA-256 of the gzipped file (save this for integrity verification)

No flags beyond `--service-account <path>`.

### `cleanup-rf01b.js`

See inline header and `README-cleanup-rf01b.md`. Removes top-level `address`,
`lat`, `lon`, `checklist`, `lastCompletedAt` from every note that has them.

> `content` is **not** touched by the current cleanup script, but it is
> included in the backup's field-count report for completeness.

### `restore-rf01b.js`

```
node restore-rf01b.js <backup.json.gz> (--only-missing | --full) [--apply]
```

- `--only-missing` — for each backup doc: if the current DB doc is missing one
  of the legacy fields that the backup has, write only that field back.
  This is the standard rollback after a bad cleanup. Does NOT revert
  unrelated changes users may have made after the backup was taken.
- `--full` — `set()` the entire backup doc over the current one. Emergency
  use only; reverts **all** post-backup edits.
- Defaults to dry-run; `--apply` must be explicit.
- Batches of 400 writes.

### `cleanup-legacy-invites.js`

One-shot migration helper for the share-by-code rollout. Deletes every doc in
the `invites` collection whose id does NOT match the new 8-char LOOKUP format
`^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$` — i.e. legacy 20-char tokens and any
other stale format. New Firestore rules already reject legacy ids on create,
so this only cleans up pre-existing rows.

```bash
# Dry-run (default): report how many docs would be deleted
node server/scripts/cleanup-legacy-invites.js

# Apply (really deletes in batches of 400)
node server/scripts/cleanup-legacy-invites.js --apply
```

Output includes total doc count, how many match the new format (kept), how
many are legacy (to delete), and a sample of up to 10 legacy ids for audit.
In `--apply` mode, progress is printed every 200 deletes.

> Idempotent: re-running after a successful apply reports 0 legacy docs.
> Safe to run periodically if you suspect stale writes (e.g. emulator data
> that slipped into prod).

## Retention & hygiene

- `backups/` is gitignored — **never commit a dump** (user data, including
  reminders, geolocation, and possibly PGP-encrypted content).
- Recommended retention: **2 weeks** on the operator's machine, then delete.
  After that, the post-cleanup state is effectively the source of truth.
- Store the SHA-256 printed by the backup script alongside the file; verify
  before restoring:
  ```bash
  shasum -a 256 backups/notes-rf01b-YYYYMMDD-HHMMSS.json.gz
  ```

## What NOT to do

- Do not run `cleanup --apply` without a fresh backup from the same session.
- Do not commit anything under `backups/`.
- Do not share backup files outside a secure channel — they contain full note
  content for all ~12 users.
- Do not use `restore --full` unless you accept losing all user edits made
  since the backup timestamp.
