status: done
agent: alpha
task: checkStalledEvasion — reset _wasOverdue quando la prossima ricorrenza scade

## ⛔ NO deploy — attendo validazione Giuseppe in locale
completed: note-editor.ts checkStalledEvasion: aggiunto case _evaded && _wasOverdue && block.time <= Date.now() → reset _evaded e _wasOverdue. Build OK.
