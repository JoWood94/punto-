status: done
agent: alpha
task: Fix scroll calendario mobile — dashboard-content blocca overflow

## Problema

`.dashboard-content` in `dashboard.scss` ha `overflow-y: hidden` hardcoded. Questo blocca lo scroll del calendario su mobile indipendentemente da quello che fa il componente calendario.

## Fix in dashboard.scss

Su mobile (max-width: 599.98px), quando siamo in vista calendario, `.dashboard-content` deve permettere lo scroll:

```scss
@media (max-width: 599.98px) {
  .dashboard-content {
    overflow-y: auto;
  }
}
```

E `.calendar-wrapper` su mobile deve lasciare che il contenuto fluisca naturalmente (non `flex: 1` con `overflow-y: auto` — quello non funziona se il parent non ha altezza fissa):

```scss
@media (max-width: 599.98px) {
  .calendar-wrapper {
    flex: none;
    height: auto;
    overflow: visible;
  }
}
```

In questo modo è `dashboard-content` a scrollare, il calendario cresce alla sua altezza naturale, e il padding-bottom deve essere sufficiente da non coprire l'ultimo contenuto col FAB (aggiungere `padding-bottom: 80px` su `.calendar-wrapper` mobile).

## ⛔ NO deploy — attendo validazione Giuseppe in locale
completed: dashboard.scss: (1) .dashboard-content @media mobile → overflow-y:auto (sblocca lo scroll che era hardcoded hidden). (2) .calendar-wrapper @media mobile → flex:none, height:auto, overflow:visible, padding-bottom:80px. È ora dashboard-content a scrollare, il calendario cresce alla sua altezza naturale.
bloccato_da:
