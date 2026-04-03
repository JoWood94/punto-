status: done
agent: alpha
task: Fix isReminderActionable — logica "giorno di calendario" per ricorrenti

## Nuova regola

**Non-ricorrente**: bottone sempre visibile (se note.id && status !== 'completed').
L'utente può marcare come evaso anche prima che suoni.

**Ricorrente**: bottone visibile se `block.time <= fine di oggi` (23:59:59 ora locale).
- Stessa giornata del reminder → visibile (utente può gestire anche in anticipo)
- Domani o dopo → nascosto (non è ancora "la tua giornata" per quell'occorrenza)
- Occorrenze passate non ancora gestite → visibili

## Fix in `note-editor.ts`

Aggiornare `isReminderActionable`:

```typescript
isReminderActionable(block: any): boolean {
  if (!this.note?.id) return false;
  if ((block.status as string) === 'completed') return false;
  if ((block.recurrence ?? 'none') !== 'none') {
    if (!block.time) return false;
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);
    return block.time <= endOfToday.getTime();
  }
  // Non-ricorrente: sempre actionable
  return true;
}
```

## Note
- Il non-ricorrente era già `return true` nell'implementazione BF-71 — verificare che sia così, altrimenti correggere.
- `endOfToday` viene ricalcolato ad ogni change detection — non serve una property statica.
- Al cambio mezzanotte l'UI si aggiorna al prossimo refresh/interazione, accettabile.

## Output atteso
- Fix in `note-editor.ts`
- Build production OK
- Aggiorna questo file con `status: done` e `completed:`

## ⛔ NO deploy — attendo validazione Giuseppe in locale
completed: note-editor.ts isReminderActionable(): ricorrenti ora confrontano block.time con endOfToday (23:59:59) invece di Date.now() — visibile se occorrenza è oggi o passata. Non-ricorrenti: return true invariato. Build OK.
