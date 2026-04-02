status: done
agent: alpha
task: Fix calendario mobile — celle uniformi + scroll bloccato da swipe handler

## Bug 1 — Celle altezza non uniforme

`grid-auto-rows: minmax(52px, auto)` fa crescere le celle che hanno note, rendendo la griglia irregolare. Tutte le celle devono avere la stessa altezza.

Fix in `calendar-view.component.scss` mobile:
```scss
.month-grid {
  grid-auto-rows: 72px; // altezza fissa uguale per tutte le celle
}
.day-cell {
  overflow: hidden; // il contenuto che eccede non spacca la cella
}
```

## Bug 2 — Scroll verticale bloccato dallo swipe handler

In `dashboard.ts`, `(touchstart)` è un listener Angular non-passive. Su iOS, il browser blocca lo scroll nativo in attesa che il listener decida se chiamare `preventDefault()`. Risultato: il calendario non scrolla.

Fix in `dashboard.ts` — aggiungere tracking Y e filtrare i gesti verticali:
```typescript
private touchStartX = 0;
private touchStartY = 0;

onTouchStart(e: TouchEvent) {
  this.touchStartX = e.touches[0].clientX;
  this.touchStartY = e.touches[0].clientY;
}

onTouchEnd(e: TouchEvent) {
  if (!this.isMobile) return;
  const deltaX = e.changedTouches[0].clientX - this.touchStartX;
  const deltaY = e.changedTouches[0].clientY - this.touchStartY;
  // Se il gesto è più verticale che orizzontale, non fare nulla (è uno scroll)
  if (Math.abs(deltaY) > Math.abs(deltaX)) return;
  if (Math.abs(deltaX) < 60) return;
  if (deltaX < 0 && this.currentMainView === 'list') {
    this.setDefaultView('calendar');
  } else if (deltaX > 0 && this.currentMainView === 'calendar') {
    this.setDefaultView('list');
  }
}
```

Inoltre in `dashboard.html`, aggiungere `touch-action: pan-y` sul `mat-sidenav-container` per dire al browser che lo scroll verticale è sempre permesso:
```html
<mat-sidenav-container style="touch-action: pan-y" ...>
```

## ⛔ NO deploy — attendo validazione Giuseppe in locale
completed: calendar-view.component.scss: grid-auto-rows→72px fisso, .day-cell overflow:hidden. dashboard.ts: touchStartY aggiunto, onTouchEnd filtra gesti verticali. dashboard.html: touch-action:pan-y su mat-sidenav-container.
bloccato_da:
