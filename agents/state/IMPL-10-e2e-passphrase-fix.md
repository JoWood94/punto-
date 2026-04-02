status: done
agent: alpha
task: Fix E2E encryption — passphrase setup vs unlock + logout forzato
completed: |
  - CryptoService: aggiunto changePassphrase() (valida vecchia, ricifra con nuova, aggiorna localStorage), saveLocalSessionVersion/getLocalSessionVersion/clearLocalSessionVersion
  - NoteService: saveEncryptionKeys() imposta encryptionSetup:true + sessionVersion:1; aggiunto updateEncryptedPrivateKey() che incrementa sessionVersion
  - Dashboard initEncryption(): usa encryptionSetup (non encryptionEnabled) per distinguere setup vs unlock; controlla sessionVersion vs locale → forced logout se mismatch; showUnlockDialog riceve sessionVersion e la salva dopo unlock; aggiunto changeEncryptionPassphrase()
  - AuthService logout(): clearLocalSessionVersion(uid) oltre a clearLocalKey
  - Build production OK
