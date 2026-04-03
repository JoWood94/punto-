status: done
agent: alpha
task: Fix initEncryption — getDocFromServer() per bypassare cache Firestore offline

## Problema

In `initEncryption()` in `dashboard.ts`, la chiamata `getUserDoc()` (o `getDoc()`) può restituire
il valore cached da IndexedDB invece del valore reale da Firestore. Dopo un reset della chiave
di cifratura su un altro device, la sessione corrente potrebbe leggere `encryptionSetup: true`
dalla cache (valore vecchio) e non mostrare il setup dialog.

## Fix

In `dashboard.ts` o nel servizio che implementa `getUserDoc()`, sostituire `getDoc()` con
`getDocFromServer()` nel contesto di `initEncryption()`. Questo forza una lettura dal server,
bypassando la cache offline.

### Verifica prima di applicare
1. Trova dove viene chiamato `getDoc` per leggere `users/{uid}` in `initEncryption()` o nel
   metodo `getUserDoc()` del servizio appropriato (verifica `note.ts`, `auth.ts` o `dashboard.ts`)
2. Importa `getDocFromServer` da `firebase/firestore` se non già presente
3. Sostituisci solo la chiamata usata in `initEncryption()` — non toccare altre chiamate `getDoc`
   nel resto dell'app (la cache è utile altrove per performance offline)

```typescript
// Prima:
const userDoc = await getDoc(userRef);

// Dopo (solo in initEncryption):
const userDoc = await getDocFromServer(userRef);
```

## Note
- `getDocFromServer` è disponibile in `firebase/firestore` — stessa import di `getDoc`
- Se `getUserDoc()` è un metodo di servizio riutilizzato, aggiungere un parametro opzionale
  `{ fromServer?: boolean }` invece di modificare tutti i chiamanti
- Build production OK

## Output atteso
- Fix in `dashboard.ts` o nel servizio appropriato
- Build production OK
- Aggiorna questo file con `status: done` e `completed:`

## ⛔ NO deploy — attendo validazione Giuseppe in locale
completed: Nessuna modifica necessaria. note.ts:getUserDoc() usa già getDocFromServer() (riga 222) — fix precedentemente implementato. initEncryption() in dashboard.ts chiama this.noteService.getUserDoc() → lettura forzata dal server già garantita.
