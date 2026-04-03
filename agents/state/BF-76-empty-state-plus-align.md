status: done
agent: alpha
task: Fix + disallineato nel bottone "Nuova nota" empty state

## Problema
`dashboard.html` riga 157: il bottone "Nuova nota" nell'empty state ha
`style="display:inline-flex;align-items:center;gap:4px"` ma il `+` rimane disallineato.
`mat-flat-button` usa MDC internamente con `.mdc-button__label` che avvolge il contenuto
e ignora i flex styles del button host.

## Fix

### Opzione 1 — SCSS (preferita)
In `dashboard.scss`, aggiungere una regola per allineare il mat-icon dentro il bottone empty-state:

```scss
.empty-state {
  button {
    .mat-icon {
      vertical-align: middle;
      font-size: 18px;
      height: 18px;
      width: 18px;
      line-height: 18px;
    }
  }
}
```

### Opzione 2 — Template
Sostituire l'inline style sul button con una classe e gestirlo via SCSS.
Rimuovere `style="display:inline-flex;align-items:center;gap:4px"` dal template,
aggiungere classe `empty-state-btn` e gestire in SCSS con display:inline-flex + gap + align.

Usare l'opzione che risolve il problema visivamente (testare su iOS Safari).

## Fix 2 — Rimuovere il puntino sotto l'icona calendario (desktop)

In `dashboard.scss` righe 640-656, eliminare completamente il blocco `.calendar-btn-active::after`
(il pseudo-elemento che crea il dot indicator). Mantenere la classe `.calendar-btn-active`
solo se usata per altri stili (es. colore), altrimenti rimuovere tutto il blocco.

## Output atteso
- Fix in `dashboard.html` e/o `dashboard.scss`
- Build production OK
- Aggiorna questo file con `status: done` e `completed:`

## ⛔ NO deploy — attendo validazione Giuseppe in locale
completed: dashboard.scss .empty-state button mat-icon: aggiunto vertical-align:middle + line-height:18px. dashboard.html: rimosso inline style non funzionante (sostituito con >). Fix2: rimosso blocco .calendar-btn-active::after (dot indicator desktop). Build OK.
