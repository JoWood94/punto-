status: done
agent: alpha
task: Fix E2E — falso setup dialog su secondo device per cache stale Firestore
completed: Rimosso fallback getDoc() in note.ts getUserDoc() — ora ritorna null se server non raggiungibile. Aggiunti log diagnostici [E2E] in dashboard.ts initEncryption(). Build production OK.

## Root cause

In `note.ts`, `getUserDoc()`:
```ts
try {
  const snap = await getDocFromServer(userRef);
  return snap.exists() ? snap.data() : null;
} catch {
  const snap = await getDoc(userRef);          // ← PROBLEMA
  return snap.exists() ? snap.data() : null;
}
```

Se `getDocFromServer()` fallisce (auth token non ancora propagato subito dopo login, o rete instabile),
cade nel catch e restituisce `getDoc()` → **cache locale stale** del device.

Su un PC che non ha mai fatto il setup E2E, la cache ha `users/{uid}` con solo `fcmTokens: []`
(snapshot precedente al setup iPhone). Il documento è non-null, ma senza `encryptionSetup`.
→ `isEncryptionConfigured = false` → mostra "Proteggi le tue note" (setup) invece di "Sblocca".

## Fix in `frontend/src/app/services/note.ts` — `getUserDoc()`

Rimuovere il fallback alla cache stale. Se il server non è raggiungibile → return null.
`initEncryption()` gestisce già null con un silent return (nessun dialog falso).

```ts
async getUserDoc(): Promise<any | null> {
  const uid = this.authService.getCurrentUserId();
  if (!uid) return null;
  const userRef = doc(this.db, `users/${uid}`);
  try {
    const snap = await getDocFromServer(userRef);
    return snap.exists() ? snap.data() : null;
  } catch {
    return null;  // Server non raggiungibile: evita cache stale
  }
}
```

## Log diagnostici da aggiungere in `initEncryption()` (dashboard.ts)

Aggiungi `console.log` in punti chiave così Giuseppe può screenshottarli dalla DevTools:

```ts
// Dopo getUserDoc()
console.log('[E2E] userDoc:', userDoc ? JSON.stringify({
  encryptionSetup: userDoc['encryptionSetup'],
  hasPublicKey: !!userDoc['publicKey'],
  hasPrivateKey: !!userDoc['encryptedPrivateKey'],
  sessionVersion: userDoc['sessionVersion']
}) : 'null');

// Dopo il check isEncryptionConfigured
console.log('[E2E] isEncryptionConfigured:', isEncryptionConfigured);
console.log('[E2E] localKey exists:', !!this.cryptoService.getLocalPrivateKey(uid));
console.log('[E2E] localSessionVersion:', this.cryptoService.getLocalSessionVersion(uid));
```

## Nessun'altra modifica necessaria
- `initEncryption()` già gestisce `userDoc === null` con silent return (nessun dialog)
- Il comportamento offline rimane invariato: se non si raggiunge il server, cifratura disabilitata per la sessione

## Output atteso
- Fix applicato in `note.ts`
- Build production OK
- Aggiorna questo file con `status: done` e `completed:`
