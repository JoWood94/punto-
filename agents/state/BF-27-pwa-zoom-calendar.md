status: done
agent: alpha
task: Fix PWA zoomabile + calendario mobile scroll e celle

## Fix 1 — Zoom PWA disabilitato (index.html)

Cambiare il meta viewport:
```html
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, interactive-widget=resizes-visual" />
```

## Fix 2 — Scroll calendario mobile (dashboard.scss)

Su iOS PWA `overflow-y: auto` da solo non è sufficiente. Aggiungere `-webkit-overflow-scrolling: touch` e approccio alternativo: invece di far scrollare `dashboard-content`, usare una altezza esplicita calcolata sul `calendar-wrapper` stesso:

```scss
@media (max-width: 599.98px) {
  .calendar-wrapper {
    flex: none;
    height: auto;
    min-height: 0;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    // Altezza massima = viewport - header - safe area, poi scrolla
    max-height: calc(var(--vh, 100vh) - var(--app-header-h, 80px));
    padding-bottom: 80px;
  }
  
  .dashboard-content {
    overflow-y: hidden; // il wrapper interno gestisce lo scroll, non il parent
  }
}
```

## Fix 3 — Celle altezza fissa (calendar-view.component.scss)

Le regole esistenti vengono probabilmente sovrascritte. Usare specificità più alta:

```scss
@media (max-width: 599.98px) {
  .month-grid {
    grid-auto-rows: 72px !important;
  }
  .month-grid .day-cell {
    height: 72px !important;
    max-height: 72px !important;
    min-height: 72px !important;
    overflow: hidden !important;
    box-sizing: border-box;
  }
}
```

## ⛔ NO deploy — attendo validazione Giuseppe in locale
completed: index.html: viewport max-scale=1/user-scalable=no. dashboard.scss: .calendar-wrapper mobile → overflow-y:auto/-webkit-overflow-scrolling:touch/max-height calcolato su --vh; .dashboard-content mobile → overflow-y:hidden. calendar-view.component.scss: grid-auto-rows e .day-cell altezze con !important per forzare specificità.
bloccato_da:
