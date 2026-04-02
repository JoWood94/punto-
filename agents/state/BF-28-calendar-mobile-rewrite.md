status: done
agent: alpha
task: Rewrite completo CSS mobile calendario — approccio corretto con month-view come scroller

## Problema

5 patch in cascata hanno lasciato CSS conflittuali. L'approccio usato (scrollare calendar-wrapper) è sbagliato perché il contenuto non supera mai il max-height e quindi lo scroll non scatta. L'approccio corretto è far scrollare solo `.month-view` internamente, tenendo l'header calendario fisso.

## Rewrite da fare

### 1. calendar-view.component.scss — rimuovere TUTTO il blocco `@media (max-width: 599.98px)` esistente e sostituirlo con:

```scss
@media (max-width: 599.98px) {
  // Il componente riempie il wrapper — altezza gestita dal parent
  :host {
    display: block;
    height: 100%;
  }

  .calendar-view {
    height: 100%;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .calendar-header {
    flex-shrink: 0;
    padding: 6px 10px;

    .nav-controls {
      gap: 2px;
      .header-label { min-width: 0; font-size: 13px; }
    }

    .view-toggle {
      align-self: stretch;
      ::ng-deep .mat-button-toggle { flex: 1; }
    }
  }

  .week-headers {
    flex-shrink: 0;
  }

  // SOLO month-view scrolla — header resta fisso
  .month-view {
    flex: 1;
    overflow-y: scroll;
    -webkit-overflow-scrolling: touch;
    padding-bottom: 88px; // spazio per FAB
  }

  .month-grid {
    grid-auto-rows: 72px; // righe fisse
    // rimuovere flex:1 che non ha effetto qui ma può causare problemi
    flex: none;
  }

  .month-grid .day-cell {
    height: 72px;
    max-height: 72px;
    overflow: hidden;
    box-sizing: border-box;
    padding: 2px;

    .day-number { font-size: 10px; width: 20px; height: 20px; line-height: 20px; }
    .day-notes .note-chip:nth-child(n+2) { display: none; }
    .more-notes { font-size: 9px; }
  }
}
```

### 2. dashboard.scss — ripristinare calendar-wrapper a qualcosa di semplice:

```scss
.calendar-wrapper {
  flex: 1;           // riempie lo spazio disponibile in dashboard-content
  overflow: hidden;  // non scrolla — è month-view che scrolla internamente
  display: flex;
  flex-direction: column;
  // NESSUNA media query speciale — comportamento uguale su mobile e desktop
}
```

Rimuovere il blocco `@media (max-width: 599.98px)` da `.calendar-wrapper`.

E per dashboard-content su mobile NON serve più overflow-y: auto — `.dashboard-content` rimane `overflow-y: hidden` sempre.

### 3. Per lo zoom su iOS PWA — verificare font-size degli input

Su iOS, se un `<input>` ha `font-size < 16px`, Safari/PWA fa auto-zoom al focus. Verificare in `login.scss` e `dashboard.scss` che tutti gli `<input>` abbiano `font-size: 16px` minimo su mobile.

## ⛔ NO deploy — attendo validazione Giuseppe in locale
completed: calendar-view.component.scss: rewrite blocco mobile — :host/calendar-view height:100%, month-view flex:1/overflow-y:scroll/-webkit-overflow-scrolling, celle 72px, week/day view style preservati. dashboard.scss: .calendar-wrapper semplificato (nessuna media query), .dashboard-content overflow-y:hidden always. login.scss + dashboard.scss: font-size:16px sugli input mobile (prevenzione auto-zoom iOS).
bloccato_da:
