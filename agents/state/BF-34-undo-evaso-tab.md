status: done
agent: alpha
task: Fix undo evasione — tornare al tab "Note" dopo undo

## Bug

Quando l'utente è nel tab "Evasi", entra in una nota, fa undo dell'evasione (`undoReminderCompleted`) e torna alla lista, il tab rimane su "Evasi". La nota è però scomparsa dalla lista evasi (ora è di nuovo pending) e il tab è vuoto o mostra una lista sbagliata.

## Fix

In `note-editor.ts`, `undoReminderCompleted` emette già `closeEditor` indirettamente via back navigation. Il problema è che `activeListTab` nel dashboard rimane su `'evasi'`.

Soluzione: quando `completedReminderNotes` si svuota (o diminuisce), resettare `activeListTab` a `'notes'`.

In `dashboard.ts`, aggiungere un getter che osserva la lista e resetta il tab se vuota. Il modo più semplice è nel getter stesso:

```typescript
get completedReminderNotes(): Note[] {
  const completed = this.filteredNotes.filter(n => n.reminderStatus === 'completed');
  if (completed.length === 0 && this.activeListTab === 'evasi') {
    // reset asincrono per evitare ExpressionChangedAfterItHasBeenCheckedError
    setTimeout(() => { this.activeListTab = 'notes'; }, 0);
  }
  return completed;
}
```

## ⛔ NO deploy — attendo validazione Giuseppe in locale
completed: dashboard.ts: getter completedReminderNotes resetta activeListTab='notes' via setTimeout quando la lista si svuota (evita ExpressionChangedAfterItHasBeenCheckedError).
bloccato_da:
