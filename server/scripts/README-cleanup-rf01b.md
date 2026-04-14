# Cleanup RF-01b: Remove Obsolete Fields from Notes

**Purpose:** Remove legacy top-level fields (`address`, `lat`, `lon`, `checklist`, `lastCompletedAt`) from Firestore `notes` collection. These fields are no longer written by the current client (v4.x frontend) and should be cleaned from old documents.

## Quick Start

### 1. Backup Firestore (CRITICAL)

Before running with `--apply`, always export a backup:

```bash
gcloud firestore export gs://your-bucket/backup-$(date +%Y%m%d-%H%M%S) \
  --database="(default)"
```

### 2. Dry-Run (Review Changes)

```bash
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/serviceAccountKey.json"
node server/scripts/cleanup-rf01b.js
```

**Expected output:**
```
[DRY-RUN MODE] No changes will be made

Fetching all notes from Firestore...
Found 1247 documents.

Processed 1247/1247 (100%) — cleaned 342 docs

=== CLEANUP SUMMARY ===
Total documents scanned: 1247
Documents with obsolete fields: 342

Field occurrence counts:
  address: 127
  lat: 95
  lon: 95
  checklist: 15
  lastCompletedAt: 10

[DRY-RUN] No changes committed. Run with --apply to execute.
```

### 3. Review Output

- Verify the field counts are reasonable
- If something looks off, abort (do not proceed to --apply)

### 4. Apply Changes

```bash
node server/scripts/cleanup-rf01b.js --apply
```

### 5. Verify in Firebase Console

Spot-check 3–5 documents to confirm the fields are gone:
- Go to [Firebase Console](https://console.firebase.google.com) → Firestore
- Open `notes` collection
- Pick a few older documents (created before v4.x)
- Verify `address`, `lat`, `lon`, `checklist`, `lastCompletedAt` are **not** present

## Credentials

The script supports three credential methods (in order of precedence):

1. **CLI argument:**
   ```bash
   node server/scripts/cleanup-rf01b.js --apply --service-account /path/to/key.json
   ```

2. **Environment variable:**
   ```bash
   export GOOGLE_APPLICATION_CREDENTIALS="/path/to/serviceAccountKey.json"
   node server/scripts/cleanup-rf01b.js --apply
   ```

3. **Application default credentials** (gcloud auth):
   ```bash
   gcloud auth application-default login
   node server/scripts/cleanup-rf01b.js --apply
   ```

## Fields Removed

| Field | Reason | Replaced by |
|-------|--------|-------------|
| `address` | Legacy geolocation format | `geolocation.address` |
| `lat` | Legacy geolocation format | `geolocation.lat` |
| `lon` | Legacy geolocation format | `geolocation.lon` |
| `checklist` | Legacy format (object instead of array) | `checklist[]` array at root |
| `lastCompletedAt` | No longer used (Fase A cleanup) | _(removed, not replaced)_ |

**Note:** `content` field is **NOT** removed. The read-shim `getNotePreview` still has fallback logic. Removal of `content` from DB will happen in a later phase.

## Batch Processing

- Documents are processed in batches of **400** (Firestore limit is 500; 400 provides safety margin)
- Progress is logged as `Processed X/total (Y%) — cleaned Z docs`
- Percentage is capped at **100%** to avoid display artifacts

## Exit Codes

- **0** — Success (dry-run or applied)
- **1** — Error (missing credentials, Firestore error, etc.)

## What NOT to Do

- ❌ Do NOT run `--apply` without reviewing dry-run output first
- ❌ Do NOT run without backing up Firestore first
- ❌ Do NOT remove `content` field (not included in this cleanup)
- ❌ Do NOT run on a single-user test; only on production after backup

---

**Created for RF-01b Fase B.**  
Firestore v9+, Firebase Admin SDK 12+.
