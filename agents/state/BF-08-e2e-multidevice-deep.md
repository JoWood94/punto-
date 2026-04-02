status: done
agent: alpha
task: Analisi profonda bug E2E multi-device — stesso bug persiste dopo BF-07

## Root cause Bug 1 — Secondo device mostra setup invece di unlock

File: note.ts:217, dashboard.ts:284

`getUserDoc()` usava `getDoc` che con `persistentLocalCache` restituisce dati stale dalla cache locale.
Se device B aveva caricato `users/{uid}` PRIMA del setup E2E (es. solo con fcmTokens), la cache
locale non conteneva `encryptionSetup: true`. Al rientro su device B, `getDoc` restituiva i dati
cachati → `userDoc['encryptionSetup']` era undefined → branch else → `showSetupDialog`.

## Root cause Bug 2 — Logout forzato non avveniva

File: dashboard.ts:273-281

Due problemi:
1. Il callback del listener era `async` ma `onSnapshot` non awaitava la Promise → se `logout()`
   lanciava un'eccezione, veniva ingoiata silenziosamente → navigate('/login') non avveniva.
2. Il guard `if (!latestDoc?.encryptionSetup) return` dipendeva da un campo potenzialmente assente
   dalla cache locale, bypassando il check sessionVersion anche quando necessario.

## Fix applicati

### Fix Bug 1 (note.ts)
- Aggiunto import `getDocFromServer`
- `getUserDoc()` ora usa `getDocFromServer` (forza lettura dal server, no cache stale)
- Fallback su `getDoc` solo se offline (eccezione di rete)

### Fix Bug 2 (dashboard.ts)
- Listener `watchUserDoc` rimosso check `encryptionSetup`: confronto diretto su `sessionVersion`
- Callback non più `async`: usa `.catch(() => {}).finally(() => navigate)` per garantire redirect
  anche se logout lancia eccezione
- In `initEncryption()`: check `isEncryptionConfigured` aggiunge fallback backward compat:
  `encryptionSetup === true` OR `(encryptedPrivateKey && publicKey)` presenti → mostra unlock

Build production OK (nessun errore TS)
