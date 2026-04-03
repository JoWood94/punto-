status: done
agent: alpha
task: Bug — evasione ricorrente scaduto non persiste al reload

## Diagnosi
buildPayload() ricalcola block.time da rb.date/rb.hour/rb.minute (campi UI), ignorando block.time aggiornato da markReminderCompleted. Anche undoRecurringEvasion aveva lo stesso problema.

## ⛔ NO deploy — attendo validazione Giuseppe in locale
completed: markReminderCompleted e undoRecurringEvasion aggiornano ora anche block.date (Date object), block.hour e block.minute dopo ogni modifica di block.time — allineati con buildPayload. Build OK.
