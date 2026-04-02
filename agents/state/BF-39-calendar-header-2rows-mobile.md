status: done
agent: alpha
task: Calendar header mobile — 2 righe: toggle sopra full-width, nav sotto

## Problema

In vista Giorno/Settimana su mobile, `.nav-controls` contiene prev + label larga + next + "Oggi" e occupa quasi tutta la larghezza. Il view-toggle (Giorno/Settimana/Mese) non ha spazio e si tronca.

In vista Mese funziona bene perché prev/next/label sono nascosti e resta solo "Oggi".

## Fix

Su mobile, il `.calendar-header` diventa a **2 righe**:
- **Riga 1**: view-toggle centrato, full-width
- **Riga 2**: nav-controls (prev / label / next / oggi) — visibile solo quando NON è vista mese (già nascosta via `*ngIf`)

### calendar-view.component.html

Riordinare i figli di `.calendar-header` mettendo `.view-toggle` PRIMA di `.nav-controls`:

```html
<div class="calendar-header">
  <mat-button-toggle-group [value]="viewType" (change)="setView($event.value)" class="view-toggle" aria-label="Vista calendario">
    <mat-button-toggle value="day">Giorno</mat-button-toggle>
    <mat-button-toggle value="week">Settimana</mat-button-toggle>
    <mat-button-toggle value="month">Mese</mat-button-toggle>
  </mat-button-toggle-group>

  <div class="nav-controls">
    <button mat-icon-button *ngIf="!(isMobile && viewType === 'month')" (click)="navigate(-1)" matTooltip="Precedente" aria-label="Precedente">
      <mat-icon>chevron_left</mat-icon>
    </button>
    <span class="header-label" *ngIf="!(isMobile && viewType === 'month')">{{ headerLabel }}</span>
    <button mat-icon-button *ngIf="!(isMobile && viewType === 'month')" (click)="navigate(1)" matTooltip="Successivo" aria-label="Successivo">
      <mat-icon>chevron_right</mat-icon>
    </button>
    <button mat-stroked-button class="today-btn" (click)="goToToday()">Oggi</button>
  </div>
</div>
```

### calendar-view.component.scss — blocco mobile

```scss
@media (max-width: 599.98px) {
  .calendar-header {
    flex-direction: column;   // 2 righe
    align-items: stretch;
    padding: 8px 10px;
    gap: 6px;
    flex-wrap: nowrap;

    .view-toggle {
      width: 100%;
      align-self: stretch;
      flex: unset;
      min-width: 0;

      ::ng-deep {
        .mat-button-toggle-group { width: 100%; }
        .mat-button-toggle { flex: 1; }
      }
    }

    .nav-controls {
      display: flex;
      align-items: center;
      justify-content: center;   // centrata nella riga
      gap: 2px;
      flex-shrink: 0;

      .header-label { min-width: 0; font-size: 13px; }

      .today-btn {
        // su mobile mese, nav-controls mostra solo "Oggi"
        // allinearlo a destra nella riga
      }
    }
  }
}
```

In vista Mese su mobile: riga 1 = toggle, riga 2 = solo "Oggi" (prev/next/label nascosti da *ngIf). È ok: il bottone "Oggi" da solo va centrato o a destra, va bene così.

## ⛔ NO deploy — attendo validazione Giuseppe in locale
completed: calendar-view.component.html: mat-button-toggle-group spostato prima di nav-controls. calendar-view.component.scss mobile: .calendar-header flex-direction:column + align-items:stretch + gap:6px; .view-toggle width:100%/flex:unset; .nav-controls justify-content:center.
bloccato_da:
