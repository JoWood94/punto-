status: done
agent: alpha
task: Fix sessionVersion — incremento da Firestore + reload al posto di logout su mismatch

## Bug 1 — saveEncryptionKeys hardcoda sessionVersion = 1

`note.ts` riga 241: `const sessionVersion = 1;`
Dopo reset + nuovo setup su Device A, Firestore ottiene sempre `sessionVersion: 1`.
Device B ha già `localSessionVersion: 1` → check `1 !== 1` → false → nessun mismatch → continua con la vecchia chiave.

### Fix
In `note.ts`, `saveEncryptionKeys()` (riga 237): leggere il valore corrente da Firestore e incrementare,
stesso pattern di `updateEncryptedPrivateKey` (riga 249-258).

```typescript
// Prima (riga 241):
const sessionVersion = 1;

// Dopo:
const snap = await getDocFromServer(userRef);
const current = snap.exists() ? (snap.data()?.['sessionVersion'] ?? 0) : 0;
const sessionVersion = current + 1;
```

Nota: `getDocFromServer` è già importato in note.ts (riga 222 lo usa in getUserDoc).
Verificare che sia nell'import statement di `firebase/firestore` o aggiungere se mancante.

## Bug 2 — Mismatch sessionVersion fa logout invece di richiedere la nuova passphrase

Il comportamento corretto su mismatch è: ricaricare la pagina (che fa rieseguire `initEncryption()`),
la quale vedendo `encryptionSetup: true` + nessuna chiave locale → chiama `showUnlockDialog` → richiede la passphrase.
NON fare logout: l'utente deve restare loggato e semplicemente sbloccare la nuova chiave.

### Fix in `dashboard.ts`

**Punto A — check startup (riga 388-396):**
```typescript
// Prima:
if (localVersion !== null && remoteVersion !== undefined && localVersion !== remoteVersion) {
  this.userDocUnsub?.();
  await this.authService.logout();
  this.router.navigate(['/login']);
  return;
}

// Dopo:
if (localVersion !== null && remoteVersion !== undefined && localVersion !== remoteVersion) {
  this.cryptoService.clearLocalKey(uid);
  this.cryptoService.clearLocalSessionVersion(uid);
  window.location.reload();
  return;
}
```

**Punto B — real-time listener (riga 398-412):**
```typescript
// Prima:
if (localVersion !== null && remoteVersion !== undefined && localVersion !== remoteVersion) {
  this.userDocUnsub?.();
  this.authService.logout().catch(() => {}).finally(() => {
    this.router.navigate(['/login']);
  });
}

// Dopo:
if (localVersion !== null && remoteVersion !== undefined && localVersion !== remoteVersion) {
  this.userDocUnsub?.();
  this.cryptoService.clearLocalKey(uid);
  this.cryptoService.clearLocalSessionVersion(uid);
  window.location.reload();
}
```

## Output atteso
- Fix in `note.ts` e `dashboard.ts`
- Build production OK
- Aggiorna questo file con `status: done` e `completed:`

## ⛔ NO deploy — attendo validazione Giuseppe in locale
completed: note.ts saveEncryptionKeys(): rimosso sessionVersion=1 hardcoded, ora legge valore corrente con getDocFromServer + incrementa. dashboard.ts: check startup e real-time listener — logout+navigate sostituiti con clearLocalKey+clearLocalSessionVersion+window.location.reload(). Build OK.
