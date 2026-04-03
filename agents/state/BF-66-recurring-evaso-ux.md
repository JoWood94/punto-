status: done
agent: alpha
task: Fix UX ricorrenti — bottone evaso + avanzamento occorrenza + cancella ricorrenza

## Contesto
BF-64 ha introdotto due regressioni:
1. Il bottone "Evaso — prossimo X" appare su note con reminder **pending** (future), non solo su `sent`
2. La modale non ha un'azione per avanzare alla prossima occorrenza — l'utente clicca, la modale apre,
   "Annulla evasione" non fa nulla (non era ancora evaso), e la nota resta bloccata

## Bug 1 — Bottone "Evaso" visibile su reminder pending

In `note-editor.html` riga 178-183, la condizione attuale è:
```html
*ngIf="note?.id && $any(block).status !== 'completed'"
```

Il bottone deve essere visibile **solo se la notifica è già scattata**, cioè `status === 'sent'`.
Fix:
```html
*ngIf="note?.id && $any(block).status === 'sent'"
```

## Bug 2 — Flusso evasione ricorrente rotto

In `note-editor.ts`, `markReminderCompleted()` (riga 573) per il caso ricorrente:
- Apre un dialog con "Annulla evasione" → imposta `pending` (ma era già pending → nulla accade)
- Non c'è modo di avanzare alla prossima occorrenza

### Fix UX corretto

Il bottone "Evaso — prossimo X" su un reminder `sent` deve avanzare alla prossima occorrenza
**senza dialog**. Azione diretta:
1. Calcola il prossimo orario: `getNextRecurrence(block.time, block.recurrence)`
2. Imposta `block.time` = prossima occorrenza (timestamp)
3. Imposta `block.status = 'pending'`
4. Chiama `this.triggerAutoSave()`

Non serve mostrare dialog per l'avanzamento. Il dialog "Cancella ricorrenza" va spostato
altrove (es. long-press o bottone separato).

**Eliminare completamente** il `RecurrenceActionDialogComponent` e la logica del dialog
nel branch `recurrence !== 'none'` di `markReminderCompleted()`.

Risultato:
```typescript
async markReminderCompleted(block: any): Promise<void> {
  const recurrence = block.recurrence ?? 'none';
  if (recurrence === 'none') {
    block.status = 'completed';
    (this.note as any).lastCompletedAt = Date.now();
    this.triggerAutoSave();
  } else {
    // Avanza alla prossima occorrenza
    block.time = this.getNextRecurrence(block.time, block.recurrence);
    block.status = 'pending';
    this.triggerAutoSave();
  }
}
```

## Bug 3 — "Cancella ricorrenza" rimuove tutto il promemoria

Attualmente `cancel_recurrence` imposta anche `block.time = null` — questo cancella il reminder del tutto.
Se l'utente vuole solo smettere di ripetere, dovrebbe restare un promemoria una tantum alla data corrente.

Fix per "Cancella ricorrenza": imposta solo `block.recurrence = 'none'`, mantieni `block.time` e `block.status`.
Se invece si vuole cancellare il promemoria → usare il tasto cestino del blocco reminder.

**Da decidere con Giuseppe prima di implementare**: vuoi che "Cancella ricorrenza" lasci
un promemoria una tantum (mantiene la data), oppure rimuova tutto?

→ In attesa risposta Giuseppe: implementa l'avanzamento diretto (Bug 1 + Bug 2) e NON toccare
il comportamento "Cancella ricorrenza" per ora (rimuovilo dal dialog dato che il dialog sparisce,
il comportamento si può aggiungere dopo).

## Rimozione `RecurrenceActionDialogComponent`
Se dopo i fix il dialog non viene più usato da nessuno, eliminare la classe dal file.
Altrimenti lasciarla ma non richiamarla da `markReminderCompleted`.

## Output atteso
- Fix in `note-editor.ts` e `note-editor.html`
- Build production OK
- Aggiorna questo file con `status: done` e `completed:`

## ⛔ NO deploy — attendo validazione Giuseppe in locale
completed: note-editor.html: condizione bottone Evadi → status==='sent'. note-editor.ts: rimosso RecurrenceActionDialogComponent; markReminderCompleted diventa sincrono — branch ricorrenti avanza time con getNextRecurrence + status='pending' + triggerAutoSave() senza dialog. Bug 3 (cancella ricorrenza) rimandato a decisione Giuseppe. Build OK.
