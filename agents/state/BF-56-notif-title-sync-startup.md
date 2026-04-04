status: done
agent: alpha
task: Fix notifTitleEnabled — non sincronizzato con NoteService al caricamento impostazioni

## Bug residuo da BF-55
`NoteService.notifTitleEnabled` viene aggiornato via `setNotifTitleEnabled()` solo quando
l'utente CAMBIA il toggle. Se la preferenza è già `true` su Firestore e l'utente apre l'app
senza toccare le impostazioni, il servizio resta a `false` → titolo cifrato comunque.

## File da leggere
- `frontend/src/app/components/settings/settings.component.ts`
  - `ngOnInit` (riga ~56): legge `notifTitleEnabled` ma lo imposta solo sul componente, non sul servizio

## Fix (1 riga)
In `settings.component.ts`, subito dopo riga 56:
```typescript
this.notifTitleEnabled = await this.noteService.getUserPreference<boolean>('notifTitleEnabled', false);
this.noteService.setNotifTitleEnabled(this.notifTitleEnabled); // ← aggiungi questa riga
```

## Output atteso
- Fix in `settings.component.ts`
- Build production OK
- ⛔ NO deploy — attendo validazione Giuseppe
completed: settings.component.ts ngOnInit — aggiunta riga setNotifTitleEnabled() dopo lettura preferenza. Build OK.
