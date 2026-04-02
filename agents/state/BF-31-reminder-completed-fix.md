status: done
agent: alpha
task: Fix segna come evaso + sezione "Completati" nella lista note

## Bug 1 — markReminderCompleted non funziona

`markReminderCompleted()` chiama `onReminderChange()` alla fine, che resetta TUTTI i reminder block a `status: 'pending'`, annullando il `completed` appena impostato.

Fix in `note-editor.ts`:

`onReminderChange()` non deve toccare lo status se è `'completed'`:
```typescript
onReminderChange() {
  this.note.blocks.forEach(b => {
    if (b.type === 'reminder' && (b as any).status !== 'completed') {
      (b as any).status = 'pending';
    }
  });
  this.triggerAutoSave();
}
```

E `markReminderCompleted()` per il caso non-ricorrente non deve chiamare `onReminderChange()` — deve chiamare direttamente `triggerAutoSave()`:
```typescript
markReminderCompleted(block: any): void {
  const recurrence = block.recurrence ?? 'none';
  if (recurrence === 'none') {
    block.status = 'completed';
    (this.note as any).lastCompletedAt = Date.now();
    this.triggerAutoSave(); // diretto, non onReminderChange
  } else {
    const next = this.getNextRecurrence(block.time!, recurrence);
    const d = new Date(next);
    block.time = next;
    block.date = d;
    block.hour = d.getHours().toString().padStart(2, '0');
    block.minute = d.getMinutes().toString().padStart(2, '0');
    block.status = 'pending';
    (this.note as any).lastCompletedAt = Date.now();
    this.onReminderChange(); // ok per ricorrenti: reimposta pending + salva
  }
}
```

## Feature — Sezione "Completati" nella lista note (dashboard)

Nella lista note del sidenav, aggiungere una sezione separata per le note con `reminderStatus === 'completed'`, sotto le note normali.

### In dashboard.ts

Aggiungere getter `completedReminderNotes` che filtra le note con `reminderStatus === 'completed'`. Escluderle da `filteredNotes` / `pinnedNotes` / `unpinnedNotes` (così non appaiono nelle sezioni normali).

### In dashboard.html

Dopo la lista note normali, aggiungere:
```html
<ng-container *ngIf="completedReminderNotes.length > 0">
  <div class="section-label">Evasi</div>
  <ng-container *ngFor="let note of completedReminderNotes">
    <ng-container *ngTemplateOutlet="noteCard; context: { note: note }"></ng-container>
  </ng-container>
</ng-container>
```

La nota card già mostra l'icona `notifications` se `reminderTime` è presente — nessun cambio visivo necessario alle card.

## ⛔ NO deploy — attendo validazione Giuseppe in locale
completed: note-editor.ts: onReminderChange() ora salta i block con status 'completed'; markReminderCompleted() usa triggerAutoSave() diretto per il caso singolo, onReminderChange() per il ricorrente. dashboard.ts: getter completedReminderNotes; pinnedNotes/unpinnedNotes escludono i completed. dashboard.html: lista unica usa pinnedNotes+unpinnedNotes (non filteredNotes grezzo); sezione "Evasi" appare sotto le note normali.
bloccato_da:
