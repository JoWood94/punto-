status: done
agent: alpha
task: Fix empty state — icona + disallineata nel bottone "Nuova nota"

## Bug
Nello stato vuoto del dashboard (nessuna nota), il bottone centrale "Nuova nota"
mostra l'icona `+` disallineata rispetto al testo.

## Fix
Trova il markup del bottone "Nuova nota" nello stato vuoto del dashboard.html
e assicurati che icona e testo siano correttamente centrati (display:flex, align-items:center, gap).

## Output atteso
- Fix in `dashboard.html` e/o `dashboard.scss`
- Build production OK
- Aggiorna questo file con `status: done` e `completed:`

## ⛔ NO deploy — attendo validazione Giuseppe in locale
completed: dashboard.html: bottone empty-state "Nuova nota" — inline-flex + align-items:center + gap:4px. Build OK.
