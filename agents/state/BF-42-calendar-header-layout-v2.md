status: done
agent: alpha
task: Calendar header mobile — Riga 1: toggle + Oggi | Riga 2: prev/label/next

## ⛔ NO deploy — attendo validazione Giuseppe in locale
completed: calendar-view.component.html: header ristrutturato in header-row-top (toggle + oggi) + nav-controls con *ngIf="!(isMobile && viewType === 'month')" sull'intero div. calendar-view.component.scss: desktop .header-row-top display:contents; mobile .calendar-header--mobile con .header-row-top flex row (toggle flex:1 + oggi flex-shrink:0) e .nav-controls centrata.
bloccato_da:
