status: done
agent: alpha
task: Rimuovere ripple/state layer da tutti i bottoni dell'app-header via CSS

## Problema

`[disableRipple]="true"` disabilita l'interactive ripple ma in Angular Material MDC non tocca il **persistent state layer** (lo sfondo che appare su hover/focus/pressed). Le icone nell'header mostrano ancora il cerchio grigio.

## Fix in dashboard.scss

```scss
// Rimuovere completamente ripple e state layer dai bottoni nell'header
.app-header {
  .mat-mdc-icon-button {
    --mat-icon-button-state-layer-color: transparent;
    --mat-icon-button-ripple-color: transparent;

    .mat-mdc-button-persistent-ripple::before { display: none; }
    .mdc-icon-button__ripple { display: none; }
    .mat-ripple { display: none; }
  }
}
```

## ⛔ NO deploy — attendo validazione Giuseppe in locale
completed: dashboard.scss: .app-header .mat-mdc-icon-button → CSS custom properties transparent + display:none su persistent-ripple, mdc-icon-button__ripple e mat-ripple.
bloccato_da:
