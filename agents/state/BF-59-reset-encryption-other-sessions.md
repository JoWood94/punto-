status: done
agent: alpha
task: Fix reset cifratura — invalida chiave locale su altre sessioni

## Problema

Quando l'utente esegue il reset della chiave di cifratura da Impostazioni (IMPL-22):
- Firestore viene aggiornato: `encryptionSetup: false`, `encryptionEnabled: false`, `publicKey` rimosso
- Le note vengono cancellate
- MA su altri device/sessioni: la vecchia chiave privata è ancora in `localStorage`
- `initEncryption()` trova la chiave locale → si fida → non mostra il setup dialog
- Risultato: l'altro device continua a cifrare nuove note con la vecchia chiave → illeggibili sulla sessione nuova

## Fix in `dashboard.ts` — `initEncryption()`

Dopo aver letto il `userDoc` da Firestore, se `encryptionSetup === false` (o campo assente):
1. Cancella la chiave privata locale per questo uid
2. Mostra il setup dialog come se fosse un nuovo utente

Firestore è la fonte di verità — mai fidarsi della chiave locale se Firestore dice che l'encryption non è configurata.

### Logica da aggiungere

Trova il punto in `initEncryption()` dove viene verificata la presenza della chiave locale. Prima di usarla, verificare che Firestore confermi `encryptionSetup: true`. Se non lo fa:

```typescript
if (!userDoc.encryptionSetup) {
  // Reset avvenuto su un altro device — invalida la chiave locale stantia
  this.cryptoService.clearLocalPrivateKey(uid);
  await this.showSetupDialog(uid);
  return;
}
```

Verifica il nome esatto del metodo `clearLocalPrivateKey` in `crypto.service.ts` prima di usarlo.

## Output atteso
- Fix in `dashboard.ts` (`initEncryption()`)
- Build production OK
- Aggiorna questo file con `status: done` e `completed:`

## ⛔ NO deploy — attendo validazione Giuseppe in locale
completed: dashboard.ts initEncryption(): aggiunto guard prima di isEncryptionConfigured — se !userDoc['encryptionSetup'], chiama clearLocalKey(uid) + clearLocalSessionVersion(uid) + showSetupDialog(uid) + return. Build production OK.
