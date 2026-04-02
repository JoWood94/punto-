status: done
agent: alpha
task: Fix promemoria ricorrenti calendario + rimuovi label sezioni lista
completed:
  1. Bug calendario: aggiunto getEffectiveRepeat() che fallback su note.recurrence (legacy) quando reminderRepeat è assente — corregge note create prima del campo reminderRepeat. isRecurringOnDate() e getNotesForDay() usano entrambi getEffectiveRepeat().
  2. Lista note: rimosso section-label dal HTML, aggiunto section-divider (8px) tra note pinnate e non-pinnate. .section-label rimosso da dashboard.scss, aggiunto .section-divider { height: 8px }.
