status: done
agent: alpha
task: Desktop — vista calendario sempre presente, drawer nota non si nasconde
completato: In `dashboard.ts` cambiato `currentMainView` da `'list'` a `'calendar'` come valore iniziale. In `dashboard.html` aggiornata la condizione `[opened]` del `<mat-sidenav>` da `currentMainView === 'list' && (!isMobile || activeNote === undefined)` a `!isMobile || activeNote === undefined`, così su desktop il drawer è sempre aperto indipendentemente dalla vista corrente.
bloccato_da:
