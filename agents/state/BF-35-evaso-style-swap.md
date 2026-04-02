status: done
agent: alpha
task: Swap stile evaso — CTA light, badge completato scuro

## Modifica

Lo stile scuro (#1C1B1F bg + testo bianco) deve essere sul **badge "Evaso"** (stato completato), NON sul bottone CTA "Segna come evaso".

### note-editor.html

Bottone CTA → tornare a `mat-stroked-button` (light, come prima di BF-33):
```html
<button mat-stroked-button class="mark-done-btn" type="button" ...>
```

Badge completato → renderlo come un bottone scuro pieno con l'undo a destra:
```html
<div class="reminder-completed-badge">
  <mat-icon>task_alt</mat-icon>
  <span>Evaso</span>
  <button mat-icon-button class="undo-done-btn" (click)="undoReminderCompleted($any(block))">
    <mat-icon>undo</mat-icon>
  </button>
</div>
```

### note-editor.scss

```scss
// CTA — light, stroked
.mark-done-btn {
  margin-top: 8px;
  width: 100%;
  // stile stroked di default, nessun override di background
}

// Badge completato — scuro, pill
.reminder-completed-badge {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  padding: 10px 16px;
  background: #1C1B1F;
  color: #FFFFFF;
  border-radius: 12px;
  font-size: 14px;
  font-family: var(--punto-font);

  mat-icon { color: #FFFFFF; font-size: 18px; width: 18px; height: 18px; }

  span { flex: 1; }

  .undo-done-btn {
    color: rgba(255,255,255,0.7);
    width: 32px;
    height: 32px;
    line-height: 32px;
    mat-icon { font-size: 18px; }
  }
}
```

## ⛔ NO deploy — attendo validazione Giuseppe in locale
completed: note-editor.html: CTA → mat-stroked-button. note-editor.scss: .mark-done-btn light/stroked; .reminder-completed-badge pill scuro #1C1B1F con testo bianco e undo button rgba bianco.
bloccato_da:
