status: done
agent: alpha
task: Fix titolo notifica — il titolo resta cifrato anche con "mostra titolo" abilitato

## Bug
L'impostazione "mostra titolo nelle notifiche" è salvata su Firestore (`notifTitleEnabled: true`)
e il server la legge correttamente. Ma il frontend cifra il titolo comunque — il server
trova un blob PGP e cade nel fallback "punto! — Promemoria".

La dialog in settings.component.ts (riga 73-74) promette "il titolo verrà salvato senza cifratura"
ma `encryptNote` non ha idea di questa preferenza.

## File da leggere prima
- `frontend/src/app/services/crypto.ts` — `encryptNote`, `ENCRYPTED_FIELDS`
- `frontend/src/app/services/note.ts` — `updateNote`, `createNote`, `getUserPreference`
- `frontend/src/app/components/settings/settings.component.ts` — come viene salvato `notifTitleEnabled`

## Fix

### 1. `CryptoService` — aggiungi parametro `skipFields` a `encryptNote`
```typescript
async encryptNote(note: Partial<Note>, skipFields: (keyof Note)[] = []): Promise<Partial<Note>> {
  // ...
  for (const field of ENCRYPTED_FIELDS) {
    if (skipFields.includes(field)) continue;  // ← aggiungi questo check
    // ... resto invariato
  }
```

### 2. `NoteService` — aggiungi proprietà cachata per `notifTitleEnabled`
Aggiungi una proprietà `notifTitleEnabled = false` a `NoteService`.
Esponi un metodo `async loadUserPreferences()` che la popola (o aggiornala nel punto
in cui già leggi le preferenze utente).

Alternativa più semplice: in `updateNote` e `createNote`, leggi `notifTitleEnabled`
tramite `getUserPreference('notifTitleEnabled', false)` e passa `skipFields` a `encryptNote`.

Valuta quale approach è più pulito — se `getUserPreference` è già cachato eviti la chiamata Firestore ad ogni save.

### 3. Chiamata aggiornata in `updateNote` e `createNote`
```typescript
const skipFields: (keyof Note)[] = notifTitleEnabled ? ['title'] : [];
const payload = this.cryptoService.isEnabled
  ? await this.cryptoService.encryptNote({ ...data, updatedAt: Date.now() }, skipFields)
  : { ...data, updatedAt: Date.now() };
```

## Note
- Se `notifTitleEnabled` è false (default), comportamento invariato — tutto cifrato come prima
- Le note già salvate con titolo cifrato continueranno a mostrare "punto! — Promemoria" finché
  non vengono risalvate con il nuovo titolo in chiaro
- Il server (index.js) è già corretto — non va toccato

## Output atteso
- Fix in `crypto.ts` e `note.ts`
- Build production OK
- ⛔ NO deploy — attendo validazione Giuseppe
completed: crypto.ts — skipFields param a encryptNote. note.ts — notifTitleEnabled cachato + setNotifTitleEnabled(), skipFields in createNote/updateNote. dashboard.ts — carica preferenza all'init. settings.component.ts — aggiorna cache al toggle. Build OK.
