status: done
agent: alpha
task: Fix header — spaziatura calendario/impostazioni desktop + ripple active errato icona calendario

## Bug 1 — Icona calendario e impostazioni troppo ravvicinate (desktop)
Le due icone in fondo all'header su desktop sono troppo vicine. Aggiungere spaziatura tra il bottone calendario e il bottone more_vert.

## Bug 2 — Ripple/stato active rimane sull'icona calendario (mobile + desktop)
L'icona calendario mostra il ripple/highlight active anche quando non è cliccata né in hover. Probabilmente causato dalla classe `calendar-btn-active` che usa background o ripple Material — va rimosso o sostituito con un indicatore che non interferisce con lo stato hover/focus del bottone.

## Fix
1. Aggiungere `margin-left` o `gap` tra bottone calendario e bottone more_vert nell'header desktop
2. Rivedere `.calendar-btn-active`: usare un indicatore di stato che NON attivi il background del ripple Material (es. un underline, un dot, o solo un cambio colore sull'icona) invece di un background che imita lo stato pressed

## ⛔ NO deploy — attendo validazione Giuseppe in locale
completed: Bug1: aggiunta classe .settings-menu-btn con margin-left:4px al bottone more_vert. Bug2: rimosso background:primary-container da .calendar-btn-active (causava il ripple persistente); sostituito con dot indicator ::after 4px centrato sotto l'icona — non interferisce con hover/focus/ripple Material.
bloccato_da:
