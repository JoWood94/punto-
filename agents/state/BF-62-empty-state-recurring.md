status: done
agent: alpha
task: Fix empty state — non mostrare se ci sono note ricorrenti

## Bug

Lo stato vuoto "Ancora nessuna nota" appare anche quando ci sono note ricorrenti visibili
nella sezione "Ricorrenti" sopra. L'utente vede la sezione Ricorrenti con note + il messaggio
vuoto sotto — incoerente.

## Fix in `dashboard.html`

La condizione che mostra l'empty state deve considerare anche `recurringNotes`:

```html
<!-- PRIMA: mostra empty state se non ci sono note normali -->
<div *ngIf="notesLoaded && filteredNotes.length === 0">

<!-- DOPO: mostra empty state solo se non ci sono né note normali né ricorrenti -->
<div *ngIf="notesLoaded && filteredNotes.length === 0 && recurringNotes.length === 0">
```

Verifica il nome esatto delle variabili usate nel template prima di applicare.

## Output atteso
- Fix in `dashboard.html`
- Build production OK
- Aggiorna questo file con `status: done` e `completed:`

## ⛔ NO deploy — attendo validazione Giuseppe in locale
completed: dashboard.html: empty-state condition aggiornata con `&& recurringNotes.length === 0`. Build OK.
