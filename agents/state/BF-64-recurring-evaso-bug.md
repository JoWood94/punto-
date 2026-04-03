status: done
agent: alpha
task: Fix ricorrenti — evaso immediato su creazione + UX modale

## Bug 1 — "Evaso — prossimo" appare subito durante la creazione

Quando l'utente seleziona "Ogni giorno" (o altra ricorrenza) su un reminder ancora in creazione,
appare subito il bottone "Evaso — prossimo". Non deve apparire: il bottone di evasione
deve comparire solo se `reminderStatus === 'sent'` (notifica già scattata) o se
la nota è già salvata con una occorrenza passata.

### Fix
In `note-editor.html`, la condizione che mostra il bottone "Evado" / "Evaso — prossimo"
deve includere il check che la nota esista già (non sia una nuova nota) e che
`reminderStatus` sia `sent` o `completed`. Non mostrare mai il bottone di evasione
su note in creazione.

## Bug 2 — UX modale evasione ricorrente

La modale che appare quando si evade un reminder ricorrente deve avere le voci in questo ordine:
1. **"Annulla evasione"** — torna a `reminderStatus: 'pending'`, ripristina l'occorrenza corrente
2. **"Cancella ricorrenza"** — imposta `recurrence: 'none'`, `reminderTime: null`, `reminderStatus: null`

Attualmente la modale ha "Fatto per questa volta" come prima voce — sostituirla con
"Annulla evasione" che fa l'undo dell'occorrenza (rimette `pending`).

### Fix
In `note-editor.ts`, nel `RecurrenceActionDialogComponent` o nel metodo `markReminderCompleted`,
cambiare la prima opzione da "Fatto per questa volta" / "sent" a "Annulla evasione" / `pending`.

## Output atteso
- Fix in `note-editor.ts` e/o `note-editor.html`
- Build production OK
- Aggiorna questo file con `status: done` e `completed:`

## ⛔ NO deploy — attendo validazione Giuseppe in locale
completed: note-editor.html: aggiunto `note?.id &&` alla condizione del bottone Evadi — nascosto su note in creazione. note-editor.ts: RecurrenceActionDialogComponent — "Fatto per questa volta" → "Annulla evasione" (close 'undo'); markReminderCompleted: handler 'undo' imposta block.status='pending' + onReminderChange() senza avanzare il time. Build OK.
