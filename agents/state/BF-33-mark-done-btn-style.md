status: done
agent: alpha
task: Restyling bottone "Segna come evaso" — background scuro, testo chiaro

## Fix

Il bottone "Segna come evaso" deve avere background `#1C1B1F` (near-black) con testo bianco — coerente con il FAB e le note card scure dell'app.

In `note-editor.html`, cambiare da `mat-stroked-button` a `mat-flat-button`:
```html
<button mat-flat-button class="mark-done-btn" type="button"
        *ngIf="$any(block).status === 'sent' || $any(block).status === 'pending'"
        (click)="markReminderCompleted($any(block))">
```

In `note-editor.scss`:
```scss
.mark-done-btn {
  margin-top: 8px;
  width: 100%;
  background-color: #1C1B1F;
  color: #FFFFFF;
  border-radius: 12px;

  mat-icon { color: #FFFFFF; }
}
```

## ⛔ NO deploy — attendo validazione Giuseppe in locale
completed: note-editor.html: mat-stroked-button → mat-flat-button. note-editor.scss: .mark-done-btn background #1C1B1F, color #FFF, border-radius 12px.
bloccato_da:
