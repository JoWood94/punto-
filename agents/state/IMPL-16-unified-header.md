status: done
agent: alpha
task: Header unificato — fix architetturale, spostare toolbar FUORI da mat-sidenav-container

## Problema

L'implementazione attuale ha due header separati su mobile:
1. `div.mobile-header` dentro `mat-sidenav` — visibile sulla lista note
2. `mat-toolbar.app-header` dentro `mat-sidenav-content` — visibile su calendario ed editor

Non è un header unico: sono due elementi che si alternano. Quando si cambia view avviene una transizione che ricrea l'header.

## Fix architetturale richiesto

L'header deve essere **un solo elemento DOM**, posizionato **sopra** `mat-sidenav-container`, fuori da tutto — come già fa `div.mobile-fab-overlay` e `div.swipe-dots`.

Struttura target in `dashboard.html`:

```html
<!-- 1. Header unico globale — FUORI dal sidenav container -->
<mat-toolbar class="app-header">
  <!-- icone contestuali animate basate su activeNote / currentMainView / isMobile -->
</mat-toolbar>

<!-- 2. Sidenav container — scalato per non sovrapporsi all'header -->
<mat-sidenav-container class="dashboard-container">
  ...
</mat-sidenav-container>

<!-- 3. FAB e dots già fuori — rimangono dove sono -->
```

## Cosa fare

1. **Estrarre** `mat-toolbar.app-header` fuori da `mat-sidenav-content` e metterlo sopra `mat-sidenav-container`
2. **Rimuovere** `div.mobile-header` dal sidenav (lista note)
3. **Consolidare** tutta la logica contestuale nell'header unico (back button, logo, delete, calendar, more_vert)
4. **Aggiustare** `mat-sidenav-container` in CSS: `height: calc(100% - 56px)` (o la variabile `--mat-toolbar-standard-height`) così il container non va sotto l'header
5. Verificare che su iOS non ci siano problemi con safe-area e `--vh`

## ⛔ NO deploy — attendo validazione Giuseppe in locale
completed: Header estratto fuori da mat-sidenav-container — singolo elemento DOM in tutti i contesti. Rimosso div.mobile-header dal sidenav. Rimossa mat-toolbar da mat-sidenav-content. CSS: --app-header-h = calc(80px + safe-area-inset-top), dashboard-container = calc(--vh - --app-header-h), dashboard-content = height: 100%. Logica contestuale unificata nel singolo toolbar (lista→cal, cal→lista, editor→back, delete mobile, calendar desktop, more_vert).
bloccato_da:
