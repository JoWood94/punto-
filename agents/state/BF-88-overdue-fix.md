status: done
agent: alpha
task: Fix markOverdueRecurrence — deve impostare _evaded e _prevTime

## ⛔ NO deploy — attendo validazione Giuseppe in locale
completed: rimosso markOverdueRecurrence; bottone "Evadi ricorrenza scaduta" chiama markReminderCompleted direttamente — stesso flusso con _prevTime/_evaded e badge undo. Build OK.
