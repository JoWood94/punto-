status: done
agent: alpha
task: Fix cerchio grigio persistente sull'icona calendario — causa non è calendar-btn-active

## Bug

Il cerchio grigio attorno all'icona calendario persiste anche dopo il fix BF-21 (che ha rimosso il background da `.calendar-btn-active`). La causa è altrove.

## Diagnosi

Il cerchio grigio su `mat-icon-button` in Angular Material può essere causato da:
1. `:focus-visible` — il bottone mantiene il focus dopo il click (touch su mobile non fa blur automatico)
2. `aria-pressed="true"` — se presente, Material applica uno stato attivo con background
3. `.mdc-icon-button--activated` — classe MDC aggiunta automaticamente
4. `color="primary"` o binding `[color]` sul bottone attivo

## Fix

Ispezionare il bottone calendario nel DOM quando il cerchio è visibile (DevTools → Elements) e identificare quale classe o attributo causa il background grigio/colorato.

Poi:
- Se è `:focus-visible`: aggiungere `(click)="calendarBtn.blur()"` o usare `cdkMonitorElementFocus` per rimuovere il focus dopo il click
- Se è `aria-pressed`: rimuovere l'attributo o impostarlo a `false` quando non attivo
- Se è una classe MDC: sovrascrivere in CSS con `background: transparent !important` mirata solo a quella classe specifica quando non in hover/focus reale
- In generale: aggiungere in CSS `.calendar-btn-active:not(:hover):not(:focus-visible) .mdc-icon-button__ripple { background: transparent }` o equivalente

L'obiettivo è che il bottone calendario abbia SOLO il dot indicator come stato attivo, e NESSUN background visibile a riposo.

## ⛔ NO deploy — attendo validazione Giuseppe in locale
completed: Doppio fix. (1) Template: aggiunto #calendarBtn + calendarBtn.blur() nel (click) handler — rimuove il focus subito dopo il tap, impedisce che :focus-visible persista. (2) CSS: .calendar-btn-active:not(:hover):not(:focus-visible) azzera opacity su .mdc-icon-button__ripple e .mat-mdc-button-persistent-ripple::before — copre il caso del layer MDC persistente. Il dot indicator ::after rimane l'unico segnale visivo dello stato attivo a riposo.
bloccato_da:
