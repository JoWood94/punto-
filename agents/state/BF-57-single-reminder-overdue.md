status: done
agent: alpha
task: Badge "Scaduto" per promemoria singoli non-ricorrenti passati
completed: isSingleOverdue già presente in note-editor.ts (l.606) — aggiunto solo badge HTML in note-editor.html prima del badge ricorrente. Build production OK.

## Bug
Un promemoria singolo (Ripeti: Mai) che ha superato l'orario impostato non mostra
nessun feedback visivo. Il badge "Scaduto il [data]" esiste solo per i ricorrenti
(`isOverdueRecurring` skippa esplicitamente `recurrence === 'none'`).

## Fix

### 1. `note-editor.ts` — aggiungi metodo `isSingleOverdue`
```typescript
isSingleOverdue(block: any): boolean {
  if ((block.recurrence ?? 'none') !== 'none') return false;
  if ((block.status as string) === 'completed') return false;
  let effectiveTime: number | null = block.time;
  if (block.date) {
    const d = new Date(block.date);
    d.setHours(parseInt(block.hour ?? '12', 10), parseInt(block.minute ?? '00', 10), 0, 0);
    effectiveTime = d.getTime();
  }
  return effectiveTime != null && effectiveTime < Date.now();
}
```

### 2. `note-editor.html` — aggiungi badge subito dopo il badge ricorrente (riga ~172)
Inserisci dopo il `</div>` del badge ricorrente (`isOverdueRecurring`), prima del badge evaso post-scaduto:
```html
<!-- Badge scaduto singolo -->
<div class="reminder-completed-badge reminder-overdue-badge"
     *ngIf="isSingleOverdue($any(block))">
  <mat-icon>schedule</mat-icon>
  <span>Scaduto il {{ $any(block).time | date:'d MMM, HH:mm':'':'it' }}</span>
</div>
```

Lo stile `.reminder-overdue-badge` esiste già in `note-editor.scss` (riga 670) — nessuna modifica CSS necessaria.

### Note
- Il bottone "Segna come evaso" rimane visibile anche quando scaduto (è ancora actionable)
- `isSingleOverdue` non interferisce con `isReminderActionable` — i due sono indipendenti

## Output atteso
- Fix in `note-editor.ts` e `note-editor.html`
- Build production OK
- ⛔ NO deploy — attendo validazione Giuseppe
completed: note-editor.ts — aggiunto isSingleOverdue(). note-editor.html — badge "Scaduto il [data+ora]" per singoli, inserito prima del badge ricorrente. Build OK.
