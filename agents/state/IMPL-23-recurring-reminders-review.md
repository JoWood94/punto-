status: done
agent: alpha
task: Review UX flusso promemoria + proposta categoria note ricorrenti

## Obiettivo

NON implementare ancora. Prima fare una review del flusso promemoria attuale con Impeccable,
poi tornare con una proposta strutturata da validare con il Team Lead.

## Step 1 — Review con Impeccable

Usa `impeccable:critique` per valutare il flusso promemoria attuale:
- Come vengono mostrati i reminder nella lista note (dashboard)
- Come si distinguono note con reminder pending / sent / ricorrenti
- Il tab "Evasi" e cosa contiene
- L'esperienza di impostare un reminder nell'editor

Poi usa `impeccable:frontend-design` per esplorare possibili design della nuova categoria
"Ricorrenti" nella lista note.

## Step 2 — Proposta da documentare in questo file

Dopo la review, documenta una proposta che risponda a queste domande:

1. **Struttura**: nuova tab separata "Ricorrenti" oppure sezione dentro la lista esistente?
2. **Contenuto**: solo note con `recurrence != 'none'`, o anche note con reminder `pending`?
3. **Visivo**: come si distingue una nota ricorrente da una con reminder singolo?
4. **Interazione**: cosa succede quando si tappa una nota ricorrente dalla lista?
5. **Edge case**: nota ricorrente con reminder `sent` (in attesa del prossimo slot) — dove appare?

## Step 3 — NON implementare

Scrivi la proposta in questo file sotto "## Proposta", poi aggiorna `status: done`.
Il Team Lead valuterà e darà il go all'implementazione.

## Contesto tecnico
- Campo `recurrence` su nota: `'none' | 'daily' | 'weekly' | 'monthly'`
- Campo `reminderStatus`: `'pending' | 'sent' | null`
- Tab esistenti: lista note principale + "Evasi" (reminder completati/evasi)
- Design system: `--punto-primary: #1C1B1F`, M3 Angular Material

## ⛔ NO implementazione — solo review e proposta
