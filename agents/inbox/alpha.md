<!-- task inviato: 2026-04-04T15:17:48.355Z | task-id: BF-61-duplicate-overdue-badge -->
task-id: BF-61-duplicate-overdue-badge
state-file: agents/state/BF-61-duplicate-overdue-badge.md

status: in_progress
agent: alpha
task: Fix badge "Scaduto" duplicato nel reminder block

## Problema
In `frontend/src/app/components/note-editor/note-editor.html` il blocco "Badge scaduto singolo" appare due volte identico (righe ~167-172 e ~174-179), causando due badge "Scaduto il X" sovrapposti.

## Fix
Rimuovere il secondo blocco duplicato (righe ~174-179):

```html
<!-- Badge scaduto singolo -->
<div class="reminder-completed-badge reminder-overdue-badge"
     *ngIf="isSingleOverdue($any(block))">
  <mat-icon>schedule</mat-icon>
  <span>Scaduto il {{ $any(block).time | date:'d MMM, HH:mm':'':'it' }}</span>
</div>
```

Tenere solo la prima occorrenza, cancellare la seconda.

## File
- `frontend/src/app/components/note-editor/note-editor.html`

