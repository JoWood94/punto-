status: done
agent: alpha
task: Desktop/tablet — promemoria ha il layout distrutto
completato: In note-editor.scss, nella sezione reminder block (riga ~466): modificato .date-field da `flex: 2; min-width: 0` a `flex: 0 0 auto; min-width: 150px` per garantire larghezza minima su desktop. Modificato .time-recurrence-row: rimosso `width: 100%` e `flex-shrink: 0`, sostituito con `flex: 1; min-width: 0` per occupare lo spazio rimanente. Nella media query mobile (max-width: 599.98px): aggiunto `min-width: unset` a .date-field per annullare il min-width su mobile.
bloccato_da:
