status: done
agent: alpha
task: Fix errore compilazione calendarBtn.blur() + rimuovi ripple da tutti i bottoni header

## Bug 1 — BLOCCANTE: errore di compilazione

In `dashboard.html` riga ~50:
```
(click)="currentMainView = 'calendar'; activeNote = undefined; calendarBtn.blur()"
```

`MatIconButton` non ha metodo `blur()` — errore TS2339 che blocca il build.

Fix: rimuovere `.blur()` dalla chiamata. La riga deve diventare:
```
(click)="currentMainView = 'calendar'; activeNote = undefined"
```

Rimuovere anche `#calendarBtn` dal template reference se non è usato altrove.

## Bug 2 — Rimuovere il ripple da tutti i bottoni dell'header

L'icona calendario (e potenzialmente altri bottoni) mostrano ancora il ripple/stato active. Soluzione definitiva: disabilitare il ripple su tutti i `mat-icon-button` dentro `.app-header`.

In `dashboard.html`, aggiungere `[disableRipple]="true"` a tutti i `mat-icon-button` dentro `mat-toolbar.app-header`.

In `dashboard.scss`, rimuovere o semplificare `.calendar-btn-active` — non serve più background né override ripple. Se vuoi mantenere l'indicatore (dot), tenerlo solo come `::after`, senza CSS per ripple/focus.

## ⛔ NO deploy — attendo validazione Giuseppe in locale
completed: dashboard.html: rimosso #calendarBtn e .blur() (fix TS2339); [disableRipple]="true" su tutti i 6 mat-icon-button dell'header. dashboard.scss: .calendar-btn-active semplificato — solo ::after dot, rimossi override ripple/focus-visible MDC.
bloccato_da:
