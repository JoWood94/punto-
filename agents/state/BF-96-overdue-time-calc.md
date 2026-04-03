status: done
agent: alpha
task: Bug — "Scaduto il" mostrato su promemoria non ancora scaduto

## Diagnosi
isOverdueRecurring usava block.time (valore Firestore stale). Il datepicker aggiorna block.date ma non block.time — divergenza possibile. Anche un nuovo reminder block ha time:null → null < Date.now() = true.

## ⛔ NO deploy — attendo validazione Giuseppe in locale
completed: isOverdueRecurring: ora calcola effectiveTime da block.date + block.hour + block.minute se disponibili, fallback su block.time. Build OK.
