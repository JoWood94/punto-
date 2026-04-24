# Share-by-code schema (E2EE)

Documento di riferimento per il flusso share-by-code con E2EE che sostituisce (big-bang, nessuna backcompat) il precedente share-by-link basato su token 20-char.

Scope di questo documento: schema Firestore + Firestore rules. Implementazione client e server è fuori scope qui — vedi `frontend/src/app/services/` per la parte Angular.

---

## 1. Codice formato `LOOKUP-KEY`

Il codice che l'utente si scambia ha sempre la forma:

```
ABCDEFGH-k7J3pQ9rT2vW_X4yZbN8mM0oLsHfGdEa
└──┬───┘ └──────────────┬────────────────┘
  LOOKUP              KEY (base64url)
```

### `LOOKUP` (doc id Firestore)

- **Lunghezza**: 8 caratteri
- **Alfabeto**: `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (~32 simboli)
  - Esclusi caratteri ambigui a mano/stampa: `0` (zero), `O`, `I` (i maiuscola), `1`, `l` (elle minuscola)
- **Entropia**: `32^8 ≈ 1.1 × 10^12` → ~40 bit
- **Case**: uppercase canonico. Il client normalizza ogni input a uppercase prima di write/read/lookup Firestore.
- **Generazione**: CSPRNG (`crypto.getRandomValues`) lato client.
- **Uso**: doc id di `invites/{LOOKUP}` → Firestore fa da lookup table pubblica.

### `KEY` (mai su Firestore)

- **Algoritmo**: AES-GCM 256 bit.
- **Encoding**: base64url senza padding (~43 char).
- **Ruolo**: è la AES key simmetrica con cui sono cifrati title/content/blocks della nota.
- **Ciclo di vita**:
  1. L'owner genera la AES key al primo share, cifra i campi della nota, e **incolla la key nel codice** che dà al guest.
  2. Il guest al primo join estrae la `KEY` dal codice, la usa **una tantum** per decifrare la nota e per ri-wrapparla con la propria PGP pub key in `sharedKeys/{myUid}`.
  3. Dopo il primo join, il client del guest scarta la `KEY` dal codice e usa solo `sharedKeys/{myUid}` per i device successivi.
- **Perché non su Firestore**: se la AES key fosse in chiaro nel doc invite, chiunque autenticato che legga l'invite (rules permettono a tutti authenticated di leggere) potrebbe decifrare la nota. La `KEY` nel codice è il segreto out-of-band che trasforma il LOOKUP in accesso effettivo.

---

## 2. Schema Firestore

### 2.1 `invites/{LOOKUP}`

| Campo | Tipo | Note |
|---|---|---|
| (doc id) | string | Esattamente 8 char dall'alfabeto unambiguous-base32 uppercase. Validato da regex nelle rules. |
| `type` | `'note' \| 'calendar'` | Whitelist. Obbligatorio. |
| `resourceId` | string non vuota | noteId o calId del resource condiviso. |
| `createdBy` | string | UID dell'owner che ha generato il codice. Deve uguagliare `request.auth.uid` al create. |
| `createdAt` | int (ms) / timestamp | Timestamp creazione (client-side `Date.now()` o serverTimestamp). |
| `expiresAt` | int (ms) | Timestamp scadenza. Deve essere nel futuro al create. Per type=`note` il client setta +365 giorni; per `calendar` +30 giorni. Cap hard enforceato da rules: max +366 giorni. |

**Vincoli enforceati da rules**:
- Doc id matches `^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$`
- `createdBy == request.auth.uid`
- `expiresAt is int && expiresAt > now`
- `expiresAt <= now + 366 * 86400 * 1000` (cap hard universale, 1 giorno di margine sopra i 365 canonici)
- `type in ['note','calendar']`
- `resourceId` presente, stringa, non vuota

**Vincoli NON enforceati da rules (demandati al client)**:
- Unicità "uno share code attivo per nota". Impossibile da verificare in rules senza query. Il client deve:
  1. Prima di `createInvite(noteId)`, query `invites` dove `resourceId == noteId && createdBy == self`
  2. Eliminare eventuali vecchi invite della stessa nota
  3. Poi creare il nuovo invite

### 2.2 `notes/{noteId}/sharedKeys/{uid}`

Nuova subcollection. Risolve il caso multi-device e il bootstrap E2EE.

| Campo | Tipo | Note |
|---|---|---|
| (doc id) | string | UID del partecipante (owner o collaborator). |
| `wrappedKey` | string | La AES key della nota cifrata con la PGP public key di `{uid}`. ASCII-armored. Non vuota, max 2000 char. |
| `wrappedAt` | timestamp | Quando è stato scritto il wrap. **Enforceato da rules**: deve essere Firestore `Timestamp` (non `int` ms, non stringa). Client DEVE usare `serverTimestamp()` o `Timestamp.now()`. |
| `wrappedBy` | string | UID di chi ha scritto il wrap. Deve uguagliare `request.auth.uid` al write. |

**Perché `wrappedBy` == `request.auth.uid`**:
- Al bootstrap dell'owner: owner scrive `sharedKeys/{ownerUid}` con `wrappedBy = ownerUid`. OK.
- Al join del guest: guest scrive `sharedKeys/{guestUid}` con `wrappedBy = guestUid`. OK.
- Un owner che bootstrappa anche wrap di un collaboratore pre-aggiunto (se mai servisse) scrive `sharedKeys/{collabUid}` con `wrappedBy = ownerUid`. OK (owner path abilita la write).

**Perché la `KEY` fa il giro**:
1. Primo share: owner genera AES, cifra nota, wrappa con propria PGP pub → `sharedKeys/{ownerUid}`.
2. Owner include la AES plaintext in base64url nel codice `LOOKUP-KEY`.
3. Guest incolla codice → client legge `invites/{LOOKUP}` → prende `resourceId=noteId`.
4. Guest estrae `KEY` dal codice → usa per decifrare la nota ONE-SHOT.
5. Guest ri-wrappa la AES con la propria PGP pub → scrive `sharedKeys/{guestUid}`.
6. Guest viene aggiunto a `notes/{noteId}.collaboratorUids` e `notes/{noteId}/collaborators/{guestUid}`.
7. Device successivi del guest leggono `sharedKeys/{guestUid}`, fanno PGP unwrap con la propria `encryptedPrivateKey`, ottengono AES, decifrano la nota. Mai più bisogno del codice.

### 2.3 Collection/subcollection invariate

- `notes/{noteId}` — campi title/content/blocks contengono già ciphertext; nessun campo nuovo.
- `notes/{noteId}/collaborators/{uid}` — invariata.
- `notes/{noteId}/presence/{uid}` — invariata.
- `notes/{noteId}/reminderSnoozes/{uid}` — invariata.
- `users/{uid}` — `publicKey`, `encryptedPrivateKey`, `encryptionEnabled`, `sessionVersion` già esistenti e usati per l'unwrap del `wrappedKey`.

---

## 3. Rules matrix

### 3.1 `invites/{LOOKUP}`

| Operazione | Chi | Condizione |
|---|---|---|
| read | qualsiasi authenticated | LOOKUP ~40bit è barriera di enumerazione. Cipher E2EE impedisce leak contenuto. |
| create | authenticated | `isValidLookup(id)` + `createdBy == self` + `expiresAt > now` + **`expiresAt <= now + 366d`** (cap hard universale) + `type in whitelist` + `resourceId` presente |
| update | nessuno | Non permesso. Per "rinnovare" un codice: delete + create nuovo. |
| delete | `createdBy` | Revoca: nuovi join impossibili, chi dentro resta. |

> **Cap TTL**: 366 giorni (un giorno di margine sopra i 365 canonici per
> tollerare il lag client/server). Universale per tutti i `type`: il
> `calendar` usa 30gg quindi è ampiamente sotto il cap.

### 3.2 `notes/{noteId}/sharedKeys/{uid}`

| Operazione | Chi | Condizione |
|---|---|---|
| read | self (`uid == request.auth.uid`) | Nessun altro — nemmeno l'owner — legge il wrap di un altro uid. Defence in depth. |
| create | owner nota OR self | + `wrappedKey` string non vuota, ≤2000 char + `wrappedBy == self` + **`wrappedAt is timestamp`** |
| update | owner nota OR self | + stessi vincoli della create |
| delete | owner nota OR self | Owner: cleanup al kickout o al delete nota. Self: leave. |

> **`wrappedAt`**: deve essere un Firestore `Timestamp` (non `int` ms, non
> stringa). Il client DEVE usare `serverTimestamp()` o `Timestamp.now()`.
> Previene payload malformati da client bacati.

### 3.3 `notes/{noteId}` (invariata)

| Operazione | Chi |
|---|---|
| read | owner, collaborators, subscriber (per eventi) |
| create | solo owner, schema tipizzato valido |
| update | owner libero; guest contenuto-only; guest può rimuoversi; nuovo guest può aggiungersi |
| delete | solo owner |

---

## 4. Flussi

### 4.1 Share (owner genera code)

```
Owner UI: "Condividi via codice"
  │
  ▼
Client: cerca invites dove resourceId=noteId & createdBy=self
  │  (se trova) → delete batch dei vecchi invite
  ▼
Client: genera AES-256 randomica
  │
  ▼
Client: cifra title/content/blocks della nota con AES (nuova o esistente se già condivisa)
  │  → writeBatch update notes/{noteId}
  ▼
Client: wrappa AES con propria PGP pub
  │  → write notes/{noteId}/sharedKeys/{ownerUid} { wrappedKey, wrappedAt, wrappedBy: ownerUid }
  ▼
Client: genera LOOKUP (8 char CSPRNG, alfabeto unambiguous)
  │
  ▼
Client: create invites/{LOOKUP} { type:'note', resourceId:noteId, createdBy:ownerUid,
                                   createdAt:now, expiresAt:now+365d }
  │
  ▼
Client: costruisce stringa "LOOKUP-BASE64URL(AES)" e la mostra/copia per l'owner
```

### 4.2 Join (guest incolla code)

```
Guest UI: "Accetta codice"
  │
  ▼
Client: split "LOOKUP-KEY", normalizza LOOKUP a uppercase
  │
  ▼
Client: read invites/{LOOKUP}
  │  (if not found OR expiresAt<now) → errore "codice non valido"
  ▼
Client: dedotto resourceId = noteId
  │
  ▼
Client: read notes/{noteId}  ← fallisce ancora perché guest non è in collaboratorUids
  │  (il read va fatto DOPO l'add collaborator; oppure servirebbe una regola temporanea?)
  │
  ▼
Client: join atomico lato owner? NO — rules permettono a self di aggiungersi a collaboratorUids
  │  → update notes/{noteId} aggiungendo guestUid a collaboratorUids (rule "nuovo guest via invite")
  ▼
Client: ora può leggere notes/{noteId} → legge ciphertext
  │
  ▼
Client: estrae KEY dal codice, decifra AES-GCM(ciphertext, KEY) → plaintext
  │  (verifica MAC: se fallisce → codice manomesso, abort)
  ▼
Client: wrappa AES (=KEY) con propria PGP pub
  │  → write notes/{noteId}/sharedKeys/{guestUid} { wrappedKey, wrappedAt, wrappedBy: guestUid }
  ▼
Client: write notes/{noteId}/collaborators/{guestUid}  (per presenza UI)
  │
  ▼
Client: scarta la KEY dal codice, da ora usa solo sharedKeys/{guestUid}
```

**Nota sul gate di lettura della nota**: la rule corrente di `notes/{noteId}` update permette a un non-collaborator di aggiungersi a `collaboratorUids`. Quindi il flusso è: prima update per auto-join → poi read. Verifica nel client: se il campo `collaboratorUids` non esiste sul doc, va creato; la rule di update richiede `request.auth.uid in request.resource.data.collaboratorUids` → ok.

### 4.3 Revoke (owner elimina invite)

```
Owner UI: "Revoca codice"
  │
  ▼
Client: delete invites/{LOOKUP}
  │  (rule permette se createdBy == self)
  ▼
Effetto: nuovi join impossibili (read invite fallisce not-found).
         Collaborator già dentro restano — le loro sharedKeys/{uid} sono intatte.
         Per rimuovere anche chi è già dentro → kickout separato (vedi 4.4).
```

### 4.4 Kickout (owner rimuove un collaborator)

```
Owner UI: "Rimuovi collaborator X"
  │
  ▼
Client: delete notes/{noteId}/sharedKeys/{xUid}  (owner path abilitato)
  │
  ▼
Client: update notes/{noteId} rimuovendo xUid da collaboratorUids
  │  (rule "owner update libero")
  ▼
Client: delete notes/{noteId}/collaborators/{xUid}  (optional cleanup)
  │
  ▼
Effetto: X perde accesso a notes/{noteId} (rule read fallisce), ma
         la copia della AES key che X aveva in locale NON viene invalidata.
         → Vedi "Decisioni architetturali" per il rationale.
```

---

## 5. Decisioni architetturali

### 5.1 NO rotazione chiave al kickout — decisione MVP

Quando l'owner rimuove un collaborator, la AES key della nota **non viene ruotata**. Il collaborator rimosso:
- Perde accesso a Firestore alla nota (Firestore rules bloccano read).
- Ma potrebbe avere la AES key cachata localmente (IndexedDB, localStorage).
- Se ha copiato la AES key offline prima del kickout, può ancora decifrare il ciphertext **che ha già visto**.
- Non può decifrare update **futuri** perché non può più leggere `notes/{noteId}` via Firestore.

**Rationale**:
- La rotazione chiave richiederebbe: genera nuova AES → re-cifra tutti i campi → re-wrappa per tutti i collaborator superstiti → scrittura atomica di N+M doc. Complessità alta, fallimenti parziali pericolosi.
- La sicurezza del modello è **garantita da Firestore rules** (gate sull'auth): un utente kickato non vede update futuri né può scrivere.
- La "confidenzialità retroattiva" (forward secrecy in caso di compromissione del device del collaborator rimosso) non è un requisito dichiarato per v1.
- Se serve in futuro: si può aggiungere una Cloud Function "rotateNoteKey(noteId)" che genera nuova AES, re-cifra, e re-wrappa per i soli collaboratorUids attuali.

### 5.2 E2EE preservata

- Title/content/blocks sono ciphertext AES-GCM-256 in Firestore. Nessun servizio (né Google, né un admin con accesso Firestore) può leggerli senza la AES key della nota.
- La AES key non è mai in chiaro in Firestore: esiste solo wrappata con PGP pub per-utente in `sharedKeys/{uid}`, e l'unwrap richiede l'`encryptedPrivateKey` dell'utente (a sua volta cifrata con passphrase derivata dalla password).
- Il server cron (`server/index.js`) non può accedere al contenuto delle note condivise: vede solo metadata (reminderTime, reminderStatus).

### 5.3 Multi-device via `sharedKeys/{uid}`

- La PGP public key di un utente è unica e persistente in `users/{uid}.publicKey`.
- Il wrap della AES key è quindi uguale per tutti i device dello stesso uid.
- Ogni device fa PGP unwrap localmente con la propria copia di `encryptedPrivateKey`.
- Nessuna necessità di propagare la AES key attraverso canali lato client (localStorage sync, etc).

### 5.4 `KEY` fuori da Firestore

- La AES key nel codice `LOOKUP-KEY` vive nel canale out-of-band (copia/incolla utente, screenshot, messaggio chat).
- Questa è una scelta deliberata: la `KEY` in Firestore vanificherebbe l'E2EE (chiunque autenticato può leggere gli invite).
- Il costo: il codice è lungo (~8+1+43 = 52 char). Trade-off accettabile per mantenere il modello zero-knowledge server-side.

### 5.5 "Uno share code attivo per nota" client-enforced

- Le Firestore rules non possono fare query, quindi il vincolo di unicità è gestito dal client.
- Rischio: race condition se owner apre lo share contemporaneamente su due device → due invite attivi. Mitigazione: il secondo create vince logicamente (il client mostra sempre l'ultimo), i vecchi invite scadono in 365 giorni.
- Se in futuro serve enforcement server-side: Cloud Function pre-write che elimina vecchi invite in una transazione.

### 5.6 Big-bang migration, no backcompat

- Il vecchio formato invite era 20-char alfanumerico random + TTL 7gg + campo legacy `noteId`.
- Le nuove rules richiedono `isValidLookup(id)` al create → i vecchi doc esistenti in Firestore restano **leggibili** (rule read è aperta) ma non sono più creabili. Il client ignorerà il formato legacy.
- Giuseppe ha approvato il big-bang: i vecchi link condivisi smettono di funzionare. I collaborator già dentro le note restano dentro (collaboratorUids è indipendente dal meccanismo di invite).

---

## 6. Test locale delle rules

Per testare le rules senza deploy in produzione, usare il Firebase Emulator Suite.

### Setup una-tantum

```bash
# dalla root del progetto
firebase init emulators
# seleziona Firestore + Auth
# accetta porte default: firestore=8080, auth=9099, UI=4000
```

### Avvio emulatore

```bash
firebase emulators:start --only firestore
```

L'emulatore carica automaticamente `firestore.rules` e `firestore.indexes.json` dalla working dir.

### Validazione sintassi (già fatta qui)

```bash
firebase deploy --only firestore:rules --dry-run
```

Output atteso:
```
✔  cloud.firestore: rules file firestore.rules compiled successfully
✔  Dry run complete!
```

### Test programmatici (raccomandato)

Usare `@firebase/rules-unit-testing`:

```bash
cd server   # o una dir dedicata
npm install --save-dev @firebase/rules-unit-testing
```

Esempio scaffold (non incluso nel commit):

```js
const { initializeTestEnvironment, assertFails, assertSucceeds } =
  require('@firebase/rules-unit-testing');

const testEnv = await initializeTestEnvironment({
  projectId: 'punto-test',
  firestore: { rules: require('fs').readFileSync('firestore.rules', 'utf8') }
});

// Test: lookup valido
const owner = testEnv.authenticatedContext('owner-uid');
await assertSucceeds(owner.firestore().doc('invites/ABCD2345').set({
  type: 'note',
  resourceId: 'note-1',
  createdBy: 'owner-uid',
  createdAt: Date.now(),
  expiresAt: Date.now() + 365 * 86400 * 1000
}));

// Test: lookup con char ambiguo (I maiuscola) → deve fallire
await assertFails(owner.firestore().doc('invites/ABCDI234').set({ /* ... */ }));

// Test: sharedKeys self-write
await assertSucceeds(owner.firestore().doc('notes/note-1/sharedKeys/owner-uid').set({
  wrappedKey: '-----BEGIN PGP MESSAGE-----\n...',
  wrappedAt: new Date(),
  wrappedBy: 'owner-uid'
}));

// Test: sharedKeys read cross-user → deve fallire
const guest = testEnv.authenticatedContext('guest-uid');
await assertFails(guest.firestore().doc('notes/note-1/sharedKeys/owner-uid').get());
```

### Smoke test manuale (via Emulator UI)

1. `firebase emulators:start`
2. Apri http://localhost:4000
3. Crea utente via Auth emulator
4. Prova scritture su `invites/{lookup}` con lookup validi/invalidi
5. Prova scritture su `notes/{id}/sharedKeys/{uid}` con scenari owner/guest/stranger

---

## 7. File modificati

- `firestore.rules` — sezione `invites` riscritta (cap TTL 366 gg + `isValidLookup`), nuova subcollection `sharedKeys` (con validatore `wrappedAt is timestamp`), nuovo helper top-level `isValidLookup()`.
- `docs/refactor/share-by-code-schema.md` — questo documento.
- `server/scripts/cleanup-legacy-invites.js` — script one-shot per eliminare invites legacy (doc id non conforme al nuovo formato LOOKUP). Supporta `--dry-run` (default) e `--apply`.
- `server/scripts/README.md` — documentazione dello script di cleanup.

Nessuna modifica a: frontend, server cron, firebase.json, firestore.indexes.json, hosting config.
