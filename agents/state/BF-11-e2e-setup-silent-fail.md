status: done
agent: alpha
task: Fix E2E — setup silently fails, keys never saved to Firestore
completed: dashboard.ts: aggiunto MatSnackBar, log granulari step-by-step in showSetupDialog(), snackbar su errore. note.ts: saveEncryptionKeys() ora lancia eccezione su uid mancante + log Firestore. Build production OK.

## Root cause confermata dai log

```
[E2E] userDoc: {"hasPublicKey":false,"hasPrivateKey":false}
[E2E] isEncryptionConfigured: false
```

Il documento Firestore esiste ma senza `publicKey`, `encryptedPrivateKey`, `encryptionSetup`.
Il setup su iPhone sembrava riuscire (dialog si chiude) ma falliva silenziosamente nel try/catch.

## Fix in `dashboard.ts` — `showSetupDialog()`

Sostituire il try/catch silenzioso con log dettagliati PER OGNI step e feedback visivo all'utente.

### Attuale (da modificare):
```ts
try {
  const { publicKey, encryptedPrivateKey } = await this.cryptoService.generateAndStoreKeys(uid, passphrase);
  const sessionVersion = await this.noteService.saveEncryptionKeys(publicKey, encryptedPrivateKey);
  this.cryptoService.setSession(uid, publicKey);
  this.cryptoService.saveLocalSessionVersion(uid, sessionVersion);
  await this.noteService.encryptExistingNotes();
} catch (e) {
  console.error('[Dashboard] Errore setup E2E:', e);
}
```

### Nuovo (log granulari + snackbar su errore):
```ts
try {
  console.log('[E2E Setup] Step 1: generazione chiavi...');
  const { publicKey, encryptedPrivateKey } = await this.cryptoService.generateAndStoreKeys(uid, passphrase);
  console.log('[E2E Setup] Step 1 OK — publicKey len:', publicKey?.length, 'encryptedPrivateKey len:', encryptedPrivateKey?.length);

  console.log('[E2E Setup] Step 2: salvataggio chiavi su Firestore...');
  const sessionVersion = await this.noteService.saveEncryptionKeys(publicKey, encryptedPrivateKey);
  console.log('[E2E Setup] Step 2 OK — sessionVersion:', sessionVersion);

  this.cryptoService.setSession(uid, publicKey);
  this.cryptoService.saveLocalSessionVersion(uid, sessionVersion);
  console.log('[E2E Setup] Sessione attiva. Cifro note esistenti...');

  await this.noteService.encryptExistingNotes();
  console.log('[E2E Setup] Setup completato.');
} catch (e) {
  console.error('[E2E Setup] ERRORE:', e);
  // Mostra errore all'utente — usa MatSnackBar se disponibile, altrimenti alert
  this.snackBar.open('Errore durante il setup della cifratura. Riprova.', 'OK', { duration: 5000 });
}
```

Assicurati che `MatSnackBar` sia iniettato nel costruttore (verifica se già presente, altrimenti aggiungilo).

## Fix in `note.ts` — `saveEncryptionKeys()`

Il silent return `if (!uid) return 1` nasconde un failure critico. Convertilo in throw:

```ts
async saveEncryptionKeys(publicKey: string, encryptedPrivateKey: string): Promise<number> {
  const uid = this.authService.getCurrentUserId();
  if (!uid) throw new Error('saveEncryptionKeys: utente non autenticato');
  const userRef = doc(this.db, `users/${uid}`);
  const sessionVersion = 1;
  console.log('[E2E] saveEncryptionKeys — uid:', uid, 'publicKey len:', publicKey?.length);
  await setDoc(userRef, { publicKey, encryptedPrivateKey, encryptionEnabled: true, encryptionSetup: true, sessionVersion }, { merge: true });
  console.log('[E2E] saveEncryptionKeys — scritto su Firestore OK');
  return sessionVersion;
}
```

## Output atteso
- Fix applicato in `dashboard.ts` e `note.ts`
- Build production OK
- Aggiorna questo file con `status: done` e `completed:`
