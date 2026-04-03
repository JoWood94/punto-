<!-- task inviato: 2026-04-03T18:38:56.898Z | task-id: BF-96-overdue-time-calc -->
task-id: BF-96-overdue-time-calc
state-file: agents/state/BF-96-overdue-time-calc.md

status: in_progress
agent: alpha
task: Bug — "Scaduto il" mostrato su promemoria non ancora scaduto

## Problema
Un promemoria ricorrente con data 03/04/2026 ore 20:40 mostra "Scaduto il" anche se non sono ancora le 20:40.
`isOverdueRecurring` usa `block.time < Date.now()` — quindi `block.time` viene calcolato come mezzanotte della data invece che come data+ora corretta.

## Diagnosi
In `note-editor.ts`, verifica come viene calcolato `block.time`:
- Probabilmente viene calcolato da `block.date` (Date a mezzanotte) senza aggiungere `block.hour` e `block.minute`
- Oppure BF-93 ha introdotto un bug nel calcolo di `block.date` durante `markReminderCompleted`

## Fix atteso
`block.time` deve essere il timestamp unix di `block.date` + ore + minuti:
```ts
const d = new Date(block.date);
d.setHours(block.hour, block.minute, 0, 0);
block.time = d.getTime();
```
Verifica che questo calcolo sia corretto ovunque `block.time` viene impostato o aggiornato.

## ⛔ NO deploy — attendo validazione Giuseppe in locale

