status: done
agent: alpha
task: Implementare cifratura E2E con OpenPGP.js
completed: |
  - npm install openpgp@6.3.0
  - Creato services/crypto.ts (CryptoService): keypair ECC curve25519Legacy, gestione sessione (setSession/clearSession/isEnabled), encrypt/decrypt di title/content/blocks
  - Creato components/passphrase-dialog/passphrase-dialog.ts: dialog unico mode=setup|unlock, strength indicator, validazione requisiti, toggle visibilità
  - Modificato services/note.ts: createNote/updateNote cifrano se isEnabled; getNotes snapshot decifra async; aggiunti getUserDoc/saveEncryptionKeys/encryptExistingNotes
  - Modificato services/auth.ts: logout chiama clearLocalKey(uid) + clearSession()
  - Modificato components/dashboard/dashboard.ts: initEncryption() in ngOnInit gestisce 4 flussi (chiave locale, unlock nuovo device, setup nuovo utente, migrazione batch)
  - Build production OK (warning budget +12KB per openpgp, nessun errore TS)

## Architettura
- Libreria: openpgp (npm install openpgp)
- Campi cifrati: title, content, checklist, address
- Campi in chiaro: reminderTime, reminderStatus, uid, color, createdAt, reminderRepeat, recurrence
- Chiave pubblica → Firestore: users/{uid}/publicKey (in chiaro)
- Chiave privata cifrata con passphrase → Firestore: users/{uid}/encryptedPrivateKey
- Chiave privata in chiaro → IndexedDB (localStorage key: `pgp_private_{uid}`)

---

## 1. Installazione
```
cd frontend && npm install openpgp
```

---

## 2. Servizio crypto (nuovo file)
`frontend/src/app/services/crypto.ts`

```typescript
import * as openpgp from 'openpgp';

export class CryptoService {
  // Genera keypair e cifra la chiave privata con la passphrase utente
  async generateAndStoreKeys(uid: string, passphrase: string): Promise<{ publicKey: string; encryptedPrivateKey: string }>

  // Carica la chiave privata in chiaro da localStorage (IndexedDB-like via localStorage)
  getLocalPrivateKey(uid: string): string | null

  // Decifra chiave privata con passphrase e salva in localStorage
  async unlockPrivateKey(uid: string, encryptedPrivateKey: string, passphrase: string): Promise<void>

  // Cifra un oggetto (solo i campi specificati)
  async encryptNote(note: Partial<Note>, publicKeyArmored: string): Promise<Partial<Note>>

  // Decifra un oggetto
  async decryptNote(note: Partial<Note>, privateKeyArmored: string): Promise<Partial<Note>>

  // Cancella chiave locale (logout)
  clearLocalKey(uid: string): void
}
```

Campi da cifrare/decifrare: `title`, `content`, `address`, `checklist` (JSON.stringify/parse per array).
Ogni campo viene cifrato individualmente come stringa base64.

---

## 3. Firestore — struttura users/{uid}
Aggiungi campi:
```typescript
publicKey?: string;          // PGP public key armored
encryptedPrivateKey?: string; // PGP private key armored, cifrata con passphrase
encryptionEnabled?: boolean;  // flag migrazione completata
```

---

## 4. Flusso login (auth.ts + dashboard.ts)

### Nuovo utente (registrazione)
Dopo la creazione account:
1. Mostra dialog "Imposta passphrase di cifratura" (vedi UI sotto)
2. Genera keypair → salva publicKey e encryptedPrivateKey su Firestore
3. Salva chiave privata in chiaro in localStorage
4. Setta encryptionEnabled: true

### Utente esistente — stesso device (chiave in localStorage)
- Chiave trovata in localStorage → procedi normalmente

### Utente esistente — nuovo device (chiave NON in localStorage)
- Scarica encryptedPrivateKey da Firestore
- Mostra dialog "Inserisci passphrase di cifratura"
- Decifra → salva in localStorage

### Utente esistente — no encryptionEnabled (migrazione)
- Mostra dialog setup passphrase (come nuovo utente)
- Dopo setup: cifra tutte le note esistenti in batch e aggiorna su Firestore

---

## 5. UI — Dialog passphrase

### Setup (nuovo utente / migrazione)
Titolo: "Proteggi le tue note"
- Input passphrase con requisiti:
  - Minimo 8 caratteri
  - Almeno 1 lettera maiuscola
  - Almeno 1 numero
  - Almeno 1 carattere speciale (!@#$%^&* ecc.)
  - Indicatore di forza (weak/medium/strong)
- Input conferma passphrase
- Toggle visibilità su entrambi
- Bottone "Imposta" (disabled se validazione fallisce)
- Testo: "Questa passphrase cifra le tue note. Non è recuperabile — conservala in un posto sicuro."

### Unlock (nuovo device)
Titolo: "Sblocca le tue note"
- Input passphrase + toggle visibilità
- Bottone "Sblocca"
- Testo: "Inserisci la passphrase per accedere alle tue note cifrate."

---

## 6. NoteService (note.ts)
- `addNote()` e `updateNote()`: prima di scrivere su Firestore, cifrare i campi se encryptionEnabled
- `getNotes()` / snapshot listener: dopo lettura da Firestore, decifrare i campi
- Il sorting, filtering e search operano DOPO la decifratura (in memoria)

---

## 7. Logout (auth.ts)
Al logout: `cryptoService.clearLocalKey(uid)` — rimuove chiave privata da localStorage

---

## Note operative
- Non usare Web Workers per ora — cifratura sincrona per semplicità
- Se CryptoService non trova la chiave privata in localStorage e non c'è encryptedPrivateKey su Firestore → tratta le note come non cifrate (backward compat utenti pre-feature)
- La ricerca full-text funziona perché opera sui dati già decifrati in memoria (filteredNotes)
- Usa `openpgp.generateKey({ type: 'ecc', curve: 'curve25519', userIDs: [{ email: uid }], passphrase: '' })` — la passphrase OpenPGP lasciala vuota (gestiamo noi la cifratura della chiave privata con AES via openpgp.encryptKey)
