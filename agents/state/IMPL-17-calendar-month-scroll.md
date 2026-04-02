status: done
agent: alpha
task: Calendario mobile — mesi scrollabili verticalmente con swipe + fix celle uniformi

## Nuova UX: mesi continui scrollabili

Invece di prev/next per cambiare mese, su mobile la vista mese mostra **più mesi impilati verticalmente**, scrollabili con swipe. Il calendario parte sul mese corrente, si può scorrere verso il passato (su) e futuro (giù).

### Struttura dati da aggiungere in calendar-view.component.ts

```typescript
export interface CalendarMonth {
  year: number;
  month: number;       // 0-based
  label: string;       // es. "Aprile 2026"
  days: CalendarDay[]; // 42 giorni (6 settimane)
}
```

Aggiungere `months: CalendarMonth[]` al componente.
`calendarDays` rimane per compatibilità con desktop.

### Logica in calendar-view.component.ts

Aggiungere metodo `buildScrollableMonths(centerDate: Date)`:
- Genera 13 mesi iniziali: da -6 a +6 rispetto a oggi
- Usa la logica esistente di `buildMonthView()` per ogni mese
- Salva in `this.months`

`ngOnChanges` chiama `buildScrollableMonths(this.currentDate)` quando `isMobile` e `viewType === 'month'`.

Aggiungere `isMobile` come `@Input() isMobile = false;` (il parent già lo conosce, passarlo).

**Infinite scroll**: quando l'utente scrolla vicino all'inizio o alla fine (threshold 300px), aggiungere automaticamente 3 mesi in prepend o append. Questo permette di scorrere liberamente tra anni, senza limiti. Non c'è un range fisso — il calendario cresce in entrambe le direzioni all'infinito.

Mantenere `navigate()` funzionante per desktop e come fallback.

### Template calendar-view.component.html

Aggiungere blocco per mobile (sotto il `<!-- Month view -->` esistente, visibile solo su mobile con `isMobile && viewType === 'month'`):

```html
<!-- Mobile: mesi scrollabili -->
<div class="months-scroll-container" *ngIf="isMobile && viewType === 'month'"
     #monthsContainer (scroll)="onMonthsScroll($event)">
  <div class="month-section" *ngFor="let m of months" [attr.data-month]="m.year + '-' + m.month">
    <div class="month-section-header">{{ m.label }}</div>
    <div class="week-headers">
      <div class="week-header" *ngFor="let h of weekHeaders">{{ h }}</div>
    </div>
    <div class="month-grid">
      <div class="day-cell" *ngFor="let day of m.days"
           [class.other-month]="!day.isCurrentMonth"
           [class.today]="day.isToday"
           [class.has-notes]="day.notes.length > 0"
           (click)="day.notes.length > 0 ? selectDay(day) : null">
        <span class="day-number">{{ day.date.getDate() }}</span>
        <div class="day-notes">
          <div class="note-chip" *ngFor="let note of day.notes.slice(0, 1)"
               ...stesso markup esistente...>
          </div>
          <div class="more-notes" *ngIf="day.notes.length > 1">+{{ day.notes.length - 1 }}</div>
        </div>
      </div>
    </div>
  </div>
</div>
```

Su desktop: la vista mese esistente rimane invariata.

### CSS calendar-view.component.scss mobile

```scss
@media (max-width: 599.98px) {
  .months-scroll-container {
    flex: 1;
    overflow-y: scroll;
    -webkit-overflow-scrolling: touch;
    padding-bottom: 88px;
  }

  .month-section {
    // nessuna altezza fissa — ogni mese è alto quanto i suoi 6 righe
  }

  .month-section-header {
    padding: 12px 8px 4px;
    font-size: 13px;
    font-weight: 600;
    color: rgba(0,0,0,0.6);
    text-transform: capitalize;
    position: sticky;
    top: 0;
    background: var(--mat-sys-background, #fafafa);
    z-index: 1;
  }

  // Celle fisse — usare height inline nel template se CSS non tiene
  .month-section .month-grid {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    grid-auto-rows: 64px; // fisso, no minmax
  }

  .month-section .month-grid .day-cell {
    height: 64px;
    max-height: 64px;
    overflow: hidden;
    box-sizing: border-box;
    padding: 2px;
    border-right: 1px solid rgba(0,0,0,0.06);
    border-bottom: 1px solid rgba(0,0,0,0.06);
  }
}
```

### Scroll iniziale sul mese corrente

In `ngAfterViewInit` (o dopo il primo render): scrollare `monthsContainer` alla posizione del mese corrente. Trovare l'elemento con `data-month="${year}-${month}"` e chiamare `scrollIntoView({ behavior: 'instant' })`.

### Passare isMobile dal parent (dashboard.ts / dashboard.html)

In `dashboard.html`:
```html
<app-calendar-view [notes]="allNotes" [isMobile]="isMobile" (noteSelected)="onCalendarNoteSelected($event)">
```

## ⛔ NO deploy — attendo validazione Giuseppe in locale
completed: calendar-view.component.ts: interfaccia CalendarMonth, @Input() isMobile, ViewChild monthsContainer, buildScrollableMonths() ±3 mesi, buildMonth() helper, onMonthsScroll() con prepend/append infinito, ngAfterViewInit scroll a mese corrente. calendar-view.component.html: month-view desktop (*ngIf !isMobile), months-scroll-container mobile con mesi impilati e sticky header. calendar-view.component.scss mobile: .months-scroll-container scroller, .month-section-header sticky, celle 64px fisse. dashboard.html: [isMobile]="isMobile" passato al componente.
bloccato_da:
