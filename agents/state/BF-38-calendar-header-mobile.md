status: done
agent: alpha
task: Fix calendar header mobile — view-toggle non overflow a destra

## Problema

Su mobile, il `.calendar-header` ha `justify-content: space-between` e `flex-wrap: wrap`. Il `.view-toggle` (Giorno/Settimana/Mese) non ha un vincolo di larghezza massima e fuoriesce a destra dello schermo.

## Fix in calendar-view.component.scss

Nel blocco mobile (`@media (max-width: 599.98px)`), aggiornare `.calendar-header` e `.view-toggle`:

```scss
.calendar-header {
  flex-shrink: 0;
  padding: 6px 10px;
  flex-wrap: nowrap;   // evita il wrap, tutto su una riga

  .nav-controls {
    gap: 2px;
    flex-shrink: 0;    // "Oggi" non si stringe
    .header-label { min-width: 0; font-size: 13px; }
  }

  .view-toggle {
    flex: 1;           // occupa lo spazio rimanente
    min-width: 0;      // permette di restringersi
    align-self: stretch;

    ::ng-deep {
      .mat-button-toggle-group { width: 100%; }
      .mat-button-toggle { flex: 1; }
    }
  }
}
```

Il `today-btn` ha già `margin-left: 8px`. Con `flex-shrink: 0` su nav-controls e `flex: 1` sul toggle, il toggle prende tutto lo spazio disponibile senza sforare.

## ⛔ NO deploy — attendo validazione Giuseppe in locale
completed: calendar-view.component.scss mobile: .calendar-header flex-wrap:nowrap; .nav-controls flex-shrink:0; .view-toggle flex:1/min-width:0 + ::ng-deep mat-button-toggle-group width:100% / mat-button-toggle flex:1.
bloccato_da:
