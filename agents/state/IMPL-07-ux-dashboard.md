status: done
agent: alpha
task: Tre miglioramenti UX dashboard — sezioni lista, promemoria ripetuti, swipe mobile
completed:
  1. Sezioni lista: getter pinnedNotes/unpinnedNotes in dashboard.ts, template con ng-template riutilizzabile e section-label CSS, header "Fissate"/"Note" solo se ci sono entrambe le sezioni.
  2. Promemoria ripetuti: 'yearly' aggiunto a ReminderBlock.recurrence e Note.recurrence; campo reminderRepeat? aggiunto a Note; opzione "Ogni anno" nel select; buildPayload() popola reminderRepeat; calendario mostra icona repeat e calcola ricorrenze (daily/weekly/monthly/yearly) in getNotesForDay — restituisce sempre la nota originale.
  3. Swipe mobile: onTouchStart/onTouchEnd in dashboard.ts con threshold 60px, eventi su mat-sidenav-container condizionati a isMobile, usa setDefaultView() esistente.
