<!-- task inviato: 2026-04-03T17:38:24.562Z | task-id: BF-86-desktop-always-calendar -->
task-id: BF-86-desktop-always-calendar
state-file: agents/state/BF-86-desktop-always-calendar.md

status: in_progress
agent: alpha
task: Fix desktop — calendario sempre visibile a destra quando nessuna nota è selezionata

## Comportamento atteso
Su desktop, l'area destra mostra SEMPRE il calendario quando nessuna nota è selezionata,
indipendentemente da quante note ci sono nella lista sinistra.
Il placeholder "Seleziona una nota o creane una." va rimosso completamente.

## Fix in `dashboard.html`

### 1. Rimuovere il `no-selection-state`
Eliminare (o commentare) il div `.no-selection-state` — non è mai utile dato che
il calendario sarà sempre visibile al suo posto.

### 2. Mostrare il calendario sempre su desktop in list view senza nota selezionata

```html
<!-- Prima (riga 246): -->
<div class="calendar-wrapper" *ngIf="(currentMainView === 'calendar' || (!isMobile && currentMainView === 'list' && filteredNotes.length === 0)) && activeNote === undefined">

<!-- Dopo: -->
<div class="calendar-wrapper" *ngIf="(currentMainView === 'calendar' || (!isMobile && currentMainView === 'list')) && activeNote === undefined">
```

In questo modo su desktop con `currentMainView === 'list'`:
- Sinistra: lista note (o empty state se non ci sono note)
- Destra: calendario sempre visibile

## Output atteso
- Fix in `dashboard.html`
- Build production OK
- Aggiorna questo file con `status: done` e `completed:`

## ⛔ NO deploy — attendo validazione Giuseppe in locale

