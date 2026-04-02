status: done
agent: alpha
task: Fix editor — colore badge Evaso + font titolo + salvataggio titolo senza blur

## Fix 1 — Badge "Evaso" colore nero

Il badge "Evaso" e il bottone "Segna come evaso" usano il colore primary (blu). Devono usare il colore near-black della palette.

In `note-editor.scss`:
```scss
.reminder-completed-badge {
  color: var(--mat-sys-on-surface); // near-black, non primary
  
  mat-icon { color: var(--mat-sys-on-surface); }
}

.mark-done-btn {
  border-color: var(--mat-sys-on-surface);
  color: var(--mat-sys-on-surface);
}
```

## Fix 2 — Font titolo nota (input non eredita font-family)

Gli elementi `<input>` non ereditano `font-family` dal parent di default in alcuni browser/ambienti.

In `note-editor.scss`:
```scss
.title-input-raw {
  font-family: var(--punto-font, 'Plus Jakarta Sans', sans-serif);
}
```

## Fix 3 — Nota non salvata se si esce senza blur sul titolo

`onTitleChange()` chiama `triggerAutoSave()` che parte solo su `(ngModelChange)`. Su mobile, se l'utente scrive nel titolo e poi fa swipe back senza aver chiuso la tastiera, `ngModel` potrebbe non aver aggiornato `note.title` con l'ultimo valore (il value dell'input e il model possono essere disallineati se il blur non scatta).

Fix in `note-editor.html` — aggiungere `(blur)` sul title input:
```html
<input #titleInput class="title-input-raw"
       [(ngModel)]="note.title"
       placeholder="Titolo"
       (ngModelChange)="onTitleChange()"
       (blur)="onTitleChange()" />
```

E in `note-editor.ts`, nel metodo `ngOnDestroy`, forzare il flush del valore dell'input prima di salvare:
```typescript
ngOnDestroy() {
  // Forza sincronizzazione valore input titolo prima di salvare
  if (this.titleInputRef?.nativeElement) {
    this.note.title = this.titleInputRef.nativeElement.value;
  }
  clearTimeout(this.autoSaveTimer);
  // ... resto invariato
}
```

## Fix 4 — Undo evasione (ripristina promemoria)

Quando il promemoria è `completed`, mostrare accanto al badge "Evaso" un bottone per annullare:

```html
<div class="reminder-completed-badge" *ngIf="$any(block).status === 'completed'">
  <mat-icon>task_alt</mat-icon>
  <span>Evaso</span>
  <button mat-icon-button class="undo-done-btn"
          (click)="undoReminderCompleted($any(block))"
          matTooltip="Annulla evasione">
    <mat-icon>undo</mat-icon>
  </button>
</div>
```

In `note-editor.ts` aggiungere `undoReminderCompleted(block)`:
```typescript
undoReminderCompleted(block: any): void {
  block.status = 'pending';
  (this.note as any).lastCompletedAt = null;
  this.triggerAutoSave();
}
```

## ⛔ NO deploy — attendo validazione Giuseppe in locale
completed: note-editor.scss: badge/btn Evaso → colore on-surface (non primary); .title-input-raw font-family esplicita; .undo-done-btn stile. note-editor.html: (blur) su title input; bottone undo nel badge completato. note-editor.ts: undoReminderCompleted(); ngOnDestroy legge nativeElement.value prima di salvare.
bloccato_da:
