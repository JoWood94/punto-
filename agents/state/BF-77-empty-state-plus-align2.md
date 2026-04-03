status: done
agent: alpha
task: Fix definitivo + disallineato — target .mdc-button__label

## Problema
Il fix precedente (BF-76) usava `vertical-align: middle` sul `mat-icon` dentro il button,
ma Angular Material MDC wrappa tutto in `.mdc-button__label` che è un flex container
e ignora `vertical-align`. Il "+" rimane in alto.

## Fix in `dashboard.scss`

Nel blocco `.empty-state button`, sostituire il contenuto con:

```scss
button {
  border-radius: var(--punto-shape-full, 9999px);

  mat-icon {
    font-size: 18px;
    width: 18px;
    height: 18px;
    line-height: 18px;
    opacity: 1;
  }

  // Target MDC interno — allinea icona e testo
  ::ng-deep .mdc-button__label {
    display: flex;
    align-items: center;
    gap: 4px;
  }
}
```

Rimuovere `vertical-align: middle` e `margin-right: 4px` dal `mat-icon` (il gap li rimpiazza).

## Output atteso
- Fix in `dashboard.scss`
- Build production OK
- Aggiorna questo file con `status: done` e `completed:`

## ⛔ NO deploy — attendo validazione Giuseppe in locale
completed: dashboard.scss .empty-state button: rimossi vertical-align:middle e margin-right:4px dal mat-icon; aggiunto ::ng-deep .mdc-button__label con display:flex + align-items:center + gap:4px. Build OK.
