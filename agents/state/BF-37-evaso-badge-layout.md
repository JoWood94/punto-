status: done
agent: alpha
task: Fix badge "Evaso" — label centrata + dimensioni stabili

## Problema

Nello screenshot: il badge "Evaso" (pill scuro) ha la label "Evaso" allineata a sinistra invece di essere centrata, e il blocco cambia dimensione quando passa da "Segna come evaso" a "Evaso".

## Fix 1 — Label centrata

Il badge usa flex con `icon + span + undo-button`. Per centrare il testo, bisogna:
- `justify-content: center` sul container
- L'undo button in `position: absolute; right: 8px`
- Il container in `position: relative`

In `note-editor.html`, il markup del badge completato deve diventare:

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

In `note-editor.scss`:

```scss
.reminder-completed-badge {
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  width: 100%;
  min-height: 44px;   // stessa altezza del mat-stroked-button
  background: #1C1B1F;
  color: white;
  border-radius: 22px;
  gap: 8px;
  box-sizing: border-box;
  padding: 0 48px; // spazio per l'undo button a destra

  mat-icon { color: white; font-size: 20px; width: 20px; height: 20px; }
  span { font-size: 14px; font-weight: 500; }
}

.undo-done-btn {
  position: absolute;
  right: 4px;
  color: white;
  --mdc-icon-button-icon-color: white;
  --mat-icon-button-state-layer-color: transparent;
  --mat-icon-button-ripple-color: transparent;
  width: 36px;
  height: 36px;

  mat-icon { font-size: 18px; width: 18px; height: 18px; }
}
```

## Fix 2 — Dimensioni stabili

Il bottone "Segna come evaso" deve avere la stessa altezza del badge (44px):

```scss
.mark-done-btn {
  width: 100%;
  min-height: 44px;
}
```

## ⛔ NO deploy — attendo validazione Giuseppe in locale
completed: note-editor.scss: .reminder-completed-badge justify-content:center + position:relative + padding:0 48px per centrare label; .undo-done-btn position:absolute right:4px; .mark-done-btn min-height:44px per altezza stabile al cambio stato.
bloccato_da:
