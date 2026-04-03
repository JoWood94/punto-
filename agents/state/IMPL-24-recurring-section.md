status: done
agent: alpha
task: Implementa sezione note ricorrenti nel dashboard

## Specifiche approvate da Giuseppe

### Struttura
Sezione collassabile **"Ricorrenti"** in cima alla lista principale (NON tab separato).
- Espansa di default
- Visibile sempre nella lista principale senza navigazione extra
- Separata dalle note normali con header cliccabile per collapse/expand

### Contenuto
Solo note con `recurrence != 'none'`, indipendentemente da `reminderStatus`.

### Visivo card
- Icona `repeat` sulla card
- Data/ora prossima occorrenza nel formato:
  - **Giornaliero:** `Dom 09:00` (giorno settimana abbreviato + orario)
  - **Settimanale:** `10/04 09:00` (gg/mm + orario)
  - **Mensile:** `10/04 09:00` (gg/mm + orario)
- Niente chip con il tipo di ricorrenza (è già visibile nell'editor)

### Interazione — bottone "Evadi" su nota ricorrente
Mostrare due opzioni (action sheet o dialog):
1. **"Fatto per questa volta"** → imposta `block.status = 'sent'`, `reminderStatus: 'sent'` — la ricorrenza continua (server ha già rischedulato il prossimo slot)
2. **"Cancella ricorrenza"** → imposta `recurrence: 'none'`, `reminderTime: null`, `reminderStatus: null` → la nota esce dalla sezione Ricorrenti e torna nella lista normale

### Edge case
- Nota ricorrente con `reminderStatus: 'sent'` (in attesa del prossimo slot) → rimane nella sezione Ricorrenti, mostra la data del prossimo slot già calcolato da `reminderTime`
- Le note ricorrenti **non vanno mai in Evasi** automaticamente

## Implementazione

### 1. `dashboard.ts`
- Aggiungere getter/computed `recurringNotes` che filtra `allNotes` per `recurrence != 'none'`
- Aggiungere `isRecurringSectionExpanded = true`
- Aggiungere metodo `formatNextOccurrence(note)` che formatta `reminderTime` nel formato corretto in base a `recurrence`

### 2. `dashboard.html`
- Prima della lista note normale, aggiungere la sezione collassabile con header "Ricorrenti" + `mat-icon` chevron
- Loop sulle `recurringNotes` con card esistente + icona repeat + data prossima occorrenza
- Le note ricorrenti NON appaiono anche nella lista normale (escluderle dal filtro principale)

### 3. `note-editor.ts` / `note-editor.html`
- Il bottone "Evadi" su una nota con `recurrence != 'none'` mostra un dialog/action sheet con le due opzioni invece di evadere direttamente
- Usa `MatDialog` o un action sheet inline

### 4. `dashboard.scss`
- Stile sezione Ricorrenti: header con font medium, chevron, separatore
- Usa `impeccable:arrange` per spacing e gerarchia visiva

## Note implementative
- Leggere dashboard.ts, dashboard.html, note-editor.ts per capire la struttura esistente prima di modificare
- `reminderTime` è già ricalcolato dal server al prossimo slot quando `recurrence != 'none'` e la notifica scatta — usarlo direttamente per il formato
- Usare `impeccable:frontend-design` per la UI della sezione e del dialog opzioni evasione

## Output atteso
- Fix in `dashboard.ts`, `dashboard.html`, `dashboard.scss`, `note-editor.ts`, `note-editor.html`
- Build production OK
- Aggiorna questo file con `status: done` e `completed:`

## ⛔ NO deploy — attendo validazione Giuseppe in locale
completed: dashboard.ts: getter recurringNotes + isRecurringSectionExpanded + formatNextOccurrence; pinnedNotes/unpinnedNotes escludono le ricorrenti. dashboard.html: sezione collapsible "Ricorrenti" in cima alla tab Note, icona repeat + data/ora sulla card, non duplicata nella lista normale. dashboard.scss: .section-header-collapsible con chevron animato. note-editor.ts: RecurrenceActionDialogComponent inline + markReminderCompleted async con dialog "Fatto per questa volta" / "Cancella ricorrenza". Build OK.
