status: done
agent: alpha
task: Implementare completamento promemoria — "Segna come evaso"

## Contesto

Attualmente i promemoria hanno `reminderStatus: 'pending' | 'sent' | null`. Quando il server invia la notifica, lo stato diventa `sent`. Non esiste un modo per l'utente di segnare manualmente un promemoria come evaso.

## Modifiche richieste

### 1. note.ts — aggiungere status 'completed'

```typescript
// Interfaccia Note
reminderStatus?: 'pending' | 'sent' | 'completed' | null;
lastCompletedAt?: number; // unix ms — timestamp dell'ultimo completamento
```

Aggiornare il tipo anche nell'interfaccia `ReminderBlock` se presente.

### 2. note-editor.ts — metodo markReminderCompleted

```typescript
markReminderCompleted(block: ReminderBlock): void {
  const recurrence = block.recurrence ?? 'none';
  
  if (recurrence === 'none') {
    // Promemoria singolo: segna come completato definitivamente
    block.status = 'completed';
    // aggiorna nota
  } else {
    // Promemoria ricorrente: calcola prossima scadenza e resetta a pending
    const next = this.getNextRecurrence(block.time!, recurrence);
    block.time = next;
    block.date = new Date(next);
    block.status = 'pending';
    // salva lastCompletedAt = Date.now() sulla nota
  }
  this.onReminderChange();
}

private getNextRecurrence(currentTime: number, recurrence: string): number {
  const d = new Date(currentTime);
  switch (recurrence) {
    case 'daily':   d.setDate(d.getDate() + 1); break;
    case 'weekly':  d.setDate(d.getDate() + 7); break;
    case 'monthly': d.setMonth(d.getMonth() + 1); break;
    case 'yearly':  d.setFullYear(d.getFullYear() + 1); break;
  }
  return d.getTime();
}
```

### 3. note-editor.html — CTA nel reminder block

Dopo gli input data/ora/ripeti, aggiungere:

```html
<!-- Stato completato -->
<div class="reminder-completed-badge" *ngIf="$any(block).status === 'completed'">
  <mat-icon>task_alt</mat-icon>
  <span>Evaso</span>
</div>

<!-- CTA segna evaso — visibile solo se status è sent o pending (non già completed) -->
<button mat-stroked-button class="mark-done-btn"
        *ngIf="$any(block).status === 'sent' || $any(block).status === 'pending'"
        (click)="markReminderCompleted($any(block))">
  <mat-icon>check_circle</mat-icon>
  {{ $any(block).recurrence !== 'none' ? 'Evaso — prossimo ' + getNextRecurrenceLabel($any(block)) : 'Segna come evaso' }}
</button>
```

Aggiungere `getNextRecurrenceLabel(block)` in TS che restituisce una stringa leggibile della prossima scadenza.

### 4. note-editor.scss — stili

```scss
.mark-done-btn {
  margin-top: 8px;
  width: 100%;
  border-color: var(--punto-primary);
  color: var(--punto-primary);
}

.reminder-completed-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
  color: var(--mat-sys-tertiary, #7D5260);
  font-size: 13px;
  mat-icon { font-size: 18px; width: 18px; height: 18px; }
}
```

### 5. dashboard.html/ts — icone nella lista note

Nel template della note card, aggiungere icona contestuale accanto alla campana:
- `task_alt` se `note.reminderStatus === 'completed'`
- `repeat` se `note.reminderTime && note.recurrence !== 'none'` (già esistente probabilmente)

Verificare come `note.recurrence` è strutturato (potrebbe essere dentro i blocchi) e usare il campo corretto.

## ⛔ NO deploy — attendo validazione Giuseppe in locale
completed: note.ts: ReminderBlock.status e Note.reminderStatus includono 'completed'; aggiunto lastCompletedAt. note-editor.ts: markReminderCompleted() (singolo→completed, ricorrente→prossima scadenza+pending), getNextRecurrence(), getNextRecurrenceLabel(); buildPayload() aggiornato con tipo 'completed' e lastCompletedAt. note-editor.html: badge "Evaso" + bottone "Segna come evaso" nel reminder block. note-editor.scss: .mark-done-btn + .reminder-completed-badge. dashboard.html: icona task_alt nella note card se reminderStatus === 'completed', altrimenti notifications.
bloccato_da:
