status: done
agent: alpha
task: Fix ricorrenti — bottone sempre visibile + undo occorrenza + transizione giorno

## Flusso corretto (da Giuseppe)

### Giorno di una ricorrenza
- Bottone **sempre visibile** → "Segna come evaso"
- Click → mostra badge "Evaso — prossima [data prossima occorrenza]" + undo
- Click badge (undo) → torna a "Segna come evaso" per QUESTA occorrenza

### Giorno successivo (passata la mezzanotte)
- La nota si resetta automaticamente: badge sparisce, bottone mostra "Segna come evaso" per la PROSSIMA occorrenza

---

## Implementazione

### Nuovi campi sul block (runtime + Firestore)
- `block._evaded: boolean` — true se l'occorrenza corrente è stata evasa (manualmente)
- `block._prevTime: number` — timestamp originale prima dell'avanzamento (per undo)

### `markReminderCompleted` (ricorrente branch)
```typescript
} else {
  // Salva timestamp originale per undo
  block._prevTime = block.time;
  block._evaded = true;
  // Avanza alla prossima occorrenza
  block.time = this.getNextRecurrence(block.time, block.recurrence);
  block.status = 'pending';
  this.triggerAutoSave();
}
```

### Nuovo metodo `undoRecurringEvasion(block)`
```typescript
undoRecurringEvasion(block: any): void {
  block.time = block._prevTime;
  block._prevTime = null;
  block._evaded = false;
  block.status = 'pending';
  this.triggerAutoSave();
}
```

### Nuovo metodo `checkStalledEvasion(block)` — chiamato in ngOnInit/loadNote
Quando la nota viene aperta, se il giorno dell'occorrenza evasa è già passato,
resettare il flag (transizione automatica al giorno successivo):
```typescript
private checkStalledEvasion(block: any): void {
  if (block._evaded && block._prevTime) {
    const prevDay = new Date(block._prevTime).setHours(0, 0, 0, 0);
    const today = new Date().setHours(0, 0, 0, 0);
    if (prevDay < today) {
      block._evaded = false;
      block._prevTime = null;
      // Non serve triggerAutoSave: il blocco verrà pulito al prossimo salvataggio utente
    }
  }
}
```
Chiamare `checkStalledEvasion` su ogni blocco reminder al caricamento della nota.
Trovare il punto corretto in `note-editor.ts` dove i blocchi vengono inizializzati
(es. dove viene fatto `this.note = note` o dove si mappa la nota in ingresso).

### `isReminderActionable`
```typescript
isReminderActionable(block: any): boolean {
  if (!this.note?.id) return false;
  if ((block.status as string) === 'completed') return false;
  if ((block.recurrence ?? 'none') !== 'none') {
    return !block._evaded; // Visibile se non ancora evasa oggi
  }
  return true; // Non-ricorrente: sempre
}
```

### `getReminderActionLabel`
```typescript
getReminderActionLabel(block: any): string {
  if ((block.recurrence ?? 'none') !== 'none') {
    if (block.time && block.time < Date.now()) {
      return 'Evaso — prossima ' + this.getNextRecurrenceLabel(block);
    }
    return 'Segna come evaso';
  }
  return 'Segna come evaso';
}
```

### `onReminderChange` — resetta SEMPRE a pending (incluso completed)
```typescript
onReminderChange() {
  this.note.blocks.forEach(b => {
    if (b.type === 'reminder') {
      (b as any).status = 'pending';
      (b as any)._evaded = false;
      (b as any)._prevTime = null;
    }
  });
  this.triggerAutoSave();
}
```

---

## In `note-editor.html`

### Badge per ricorrente evasa (sostituisce/affianca il badge completed)
```html
<!-- Badge evaso ricorrente — con undo -->
<button class="reminder-completed-badge" type="button"
        *ngIf="note?.id && $any(block).recurrence !== 'none' && $any(block)._evaded"
        (click)="undoRecurringEvasion($any(block))"
        matTooltip="Tocca per annullare evasione">
  <mat-icon>task_alt</mat-icon>
  <span>Evaso — prossima {{ $any(block).time | date:'d MMM':'':'it' }}</span>
  <mat-icon class="undo-icon">undo</mat-icon>
</button>
```

Nota: il badge usa `block.time` direttamente (già avanzato alla prossima occorrenza),
NON `getNextRecurrenceLabel` (che aggiungerebbe un'ulteriore avanzamento).

### Bottone "Segna come evaso" — condizione aggiornata
```html
*ngIf="isReminderActionable($any(block))"
```

---

## Output atteso
- Fix in `note-editor.ts` e `note-editor.html`
- Build production OK
- Aggiorna questo file con `status: done` e `completed:`

## ⛔ NO deploy — attendo validazione Giuseppe in locale
completed: note-editor.ts: markReminderCompleted ricorrente salva _prevTime+_evaded=true prima di avanzare; undoRecurringEvasion() ripristina time+_evaded=false; checkStalledEvasion() (privato) resetta flag se _prevTime è di ieri o prima; chiamato nel loop initNote per ogni reminder. isReminderActionable: ricorrenti visibili se !_evaded. onReminderChange: resetta status+_evaded+_prevTime. note-editor.html: badge ricorrente evasa (con data prossima occorrenza e undo) affianca badge completed esistente. Build OK.
