status: done
agent: alpha
task: Fix ricorrenti — bottone evado visibile solo se occorrenza scaduta

## Problema
Dopo aver cliccato "Segna come evaso" su un ricorrente, `block.time` avanza alla prossima
occorrenza (es. domani). Il bottone continua a mostrare "Segna come evaso" perché la condizione
è solo `status !== 'completed'`. L'utente non deve poter evadere un'occorrenza che non è ancora
arrivata.

## Regola
**Promemoria ricorrente**: il bottone è visibile SOLO se `block.time < Date.now()`
(l'occorrenza corrente è già scaduta). Se il tempo è nel futuro → nessun bottone.

**Promemoria singolo**: bottone sempre visibile (utente può marcare in anticipo).

## Fix in `note-editor.ts`

Sostituire/aggiungere il metodo `isReminderActionable`:

```typescript
isReminderActionable(block: any): boolean {
  if (!this.note?.id) return false;
  if ((block.status as string) === 'completed') return false;
  if ((block.recurrence ?? 'none') !== 'none') {
    // Ricorrente: solo se l'occorrenza corrente è già scaduta
    return !!block.time && block.time < Date.now();
  }
  // Singolo: sempre actionable (utente può marcare anche in anticipo)
  return true;
}
```

Aggiornare anche `getReminderActionLabel` — per i ricorrenti il bottone compare SOLO quando
`block.time < Date.now()`, quindi il label è sempre "Evaso — prossima [data]":

```typescript
getReminderActionLabel(block: any): string {
  if ((block.recurrence ?? 'none') !== 'none') {
    return 'Evaso — prossima ' + this.getNextRecurrenceLabel(block);
  }
  return 'Segna come evaso';
}
```

## Fix in `note-editor.html`

Riga del bottone mark-done — assicurarsi che usi `isReminderActionable`:
```html
*ngIf="isReminderActionable($any(block))"
```

## Output atteso
- Fix in `note-editor.ts` e `note-editor.html`
- Build production OK
- Aggiorna questo file con `status: done` e `completed:`

## ⛔ NO deploy — attendo validazione Giuseppe in locale
completed: note-editor.ts: aggiunto isReminderActionable(block) — false se !note.id, false se completed, per ricorrenti false se block.time >= Date.now(); aggiornato getReminderActionLabel() — ricorrenti mostrano sempre "Evaso — prossima [data]". note-editor.html: *ngIf bottone → isReminderActionable(). Build OK.
