status: done
agent: alpha
task: Fix celle calendario mobile — altezza fissa anche dopo caricamento note

## Bug

Su mobile le celle della griglia mese si ridimensionano quando le note vengono caricate dinamicamente. `grid-auto-rows: 72px` non è sufficiente perché il contenuto della cella (chips nota) può forzare la riga a crescere.

## Fix in calendar-view.component.scss — media query mobile (max-width: 599.98px)

```scss
.month-grid .day-cell {
  height: 72px;          // altezza fissa esplicita sulla cella, non solo sulla riga
  max-height: 72px;      // impedisce la crescita
  overflow: hidden;      // il contenuto in eccesso viene clippato
  box-sizing: border-box;
}
```

Questo garantisce che anche quando le note vengono caricate e i chip appaiono, la cella non si espande.

## ⛔ NO deploy — attendo validazione Giuseppe in locale
completed: calendar-view.component.scss mobile: .day-cell → height:72px, max-height:72px, overflow:hidden, box-sizing:border-box. Le celle non crescono più al caricamento dei chip.
bloccato_da:
