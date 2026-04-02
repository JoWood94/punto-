status: done
agent: alpha
task: Sostituire input[type=time] con due <select> ore + minuti (solo multipli di 5)

## ⛔ NO deploy — attendo validazione Giuseppe in locale
completed: note-editor.ts: aggiunti readonly hours[] e minutes[]; rimossi getReminderTimeValue e onReminderTimeChange. note-editor.html: time-fill-field sostituito con time-selects-wrapper (mat-select ore 00–23 + mat-select min 00/05…55 con ngModelChange). note-editor.scss: stili time-fill-* rimossi; aggiunto .time-selects-wrapper con flex layout.
bloccato_da:
