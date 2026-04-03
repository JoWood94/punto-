status: done
agent: alpha
task: Fix bottone evado — flusso completo singolo/ripetuto + rimozione cancella ricorrenza

## Flusso corretto (da Giuseppe)

### Promemoria singolo (recurrence === 'none')
- Bottone: **"Segna come evaso"** sempre visibile (se note.id && status !== 'completed')
- Click → `status = 'completed'` → sparisce il bottone, appare badge "Evaso" con undo
- Undo → torna a `status = 'pending'`

### Promemoria ripetuto (recurrence !== 'none')
- Se `block.time < Date.now()` (tempo scaduto, notifica già scattata o in attesa del cron):
  → Bottone: **"Evaso — prossima [data]"**
- Se `block.time >= Date.now()` (futuro, non ancora scattato):
  → Bottone: **"Segna come evaso"** (avanzamento manuale anticipato)
- Click in ENTRAMBI i casi → avanza alla prossima occorrenza:
  `block.time = getNextRecurrence(block.time, block.recurrence)`, `block.status = 'pending'`

### Cancella ricorrenza
Rimossa. L'utente usa il dropdown "Ripeti → Mai" per cancellare la ricorrenza.
Nessuna modale, nessun bottone separato.

---

## Modifiche in `note-editor.html`

### Bottone "Segna come evaso" / "Evaso — prossima"

Sostituire la condizione attuale con:
```html
<!-- CTA evado — sempre visibile se nota salvata e non completata -->
<button mat-stroked-button class="mark-done-btn" type="button"
        *ngIf="note?.id && $any(block).status !== 'completed'"
        (click)="markReminderCompleted($any(block))">
  <mat-icon>check_circle</mat-icon>
  {{ getReminderActionLabel($any(block)) }}
</button>
```

### Rimozione bottone "Cancella ricorrenza" (aggiunto da BF-68)
Eliminare il `<button class="cancel-recurrence-btn">` e il relativo `*ngIf`.

---

## Modifiche in `note-editor.ts`

### Aggiungere helper per il label
```typescript
getReminderActionLabel(block: any): string {
  const recurrence = block.recurrence ?? 'none';
  if (recurrence === 'none') return 'Segna come evaso';
  if (block.time && block.time < Date.now()) {
    return 'Evaso — prossima ' + this.getNextRecurrenceLabel(block);
  }
  return 'Segna come evaso';
}
```

### `markReminderCompleted` — mantenere la logica di BF-66
```typescript
markReminderCompleted(block: any): void {
  const recurrence = block.recurrence ?? 'none';
  if (recurrence === 'none') {
    block.status = 'completed';
    (this.note as any).lastCompletedAt = Date.now();
    this.triggerAutoSave();
  } else {
    block.time = this.getNextRecurrence(block.time, block.recurrence);
    block.status = 'pending';
    this.triggerAutoSave();
  }
}
```

### Rimozione `cancelRecurrence()` (aggiunto da BF-68)
Eliminare il metodo `cancelRecurrence(block: any)`.

---

## Modifiche in `note-editor.scss`

Rimuovere la classe `.cancel-recurrence-btn` aggiunta da BF-68.

---

## Output atteso
- Fix in `note-editor.ts`, `note-editor.html`, `note-editor.scss`
- Build production OK
- Aggiorna questo file con `status: done` e `completed:`

## ⛔ NO deploy — attendo validazione Giuseppe in locale
completed: note-editor.html: rimosso bottone "Cancella ricorrenza" (BF-68); condizione bottone evadi → status!=='completed' + usa getReminderActionLabel(). note-editor.ts: aggiunto getReminderActionLabel() con logica scaduto/futuro; rimosso cancelRecurrence(). note-editor.scss: rimossa .cancel-recurrence-btn. Build OK.
