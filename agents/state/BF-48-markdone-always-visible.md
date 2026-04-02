status: done
agent: alpha
task: Fix "Segna come evaso" — visibile anche quando status è null

## ⛔ NO deploy — attendo validazione Giuseppe in locale
completed: note-editor.html: condizione *ngIf del .mark-done-btn cambiata da "=== 'sent' || === 'pending'" a "!== 'completed'" — bottone visibile per null/pending/sent, nascosto solo quando già completato.
bloccato_da:
