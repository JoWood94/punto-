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

---

## Review Impeccable (critique)

Nielsen score: **25/40** — moderato.

### Problemi identificati

**P0 — Ricorrenza invisibile**
Nota giornaliera e nota con reminder singolo sono visivamente identiche. Bell icon identica,
nessun badge, nessuna distinzione. L'utente non sa quale nota riscatterà domani.

**P1 — Stato "sent" limbo**
Dopo che un reminder ricorrente scatta → `reminderStatus: 'sent'`. La nota torna nel listing
come normale nota. Nessun segnale che riscatterà. L'utente perde il contesto temporale.

**P2 — "Evasi" semanticamente rotto per ricorrenti**
"Evasi" = fatto/chiuso. Un reminder ricorrente non è mai davvero evaso — ripartirà.
Se l'utente marca come completato un reminder ricorrente, finisce in "Evasi" ma la nota
continuerà a ricorrere → confusione garantita.

**P3 — Bell icon sovraccarica**
Un'icona per 4 stati: pending-futuro, pending-scaduto, ricorrente-attivo, ricorrente-dormiente.
L'utente non può distinguere urgenza o comportamento.

---

## Proposta

### 1. Struttura — Sezione nella lista esistente, NON nuova tab

Aggiungere una sezione "Ricorrenti" sopra le note normali (dopo "Fissate"), visibile
solo se esistono note con `recurrence !== 'none'`.

**Motivazione**: una nuova tab aggiunge cognitive overhead e navigation cost. Le note
ricorrenti non sono un tipo separato — sono note con un comportamento. Una sezione
contestuale (come "Fissate") è coerente con il pattern già in uso.

```
[ Fissate ]          ← solo se presenti
[ Ricorrenti ]       ← solo se recurrence !== 'none'
[ Note ]             ← tutte le altre
```

### 2. Contenuto della sezione "Ricorrenti"

- Include **tutte** le note dove `recurrence !== 'none'`, qualunque sia `reminderStatus`
- Ordinamento: per prossimo trigger (le più imminenti prima)
- Escluse dal conteggio delle note normali (non appaiono duplicate)

### 3. Visivo — Differenziazione icone per stato

Sostituire la bell generica con icone contestuali:

| Stato | Icona | Note |
|---|---|---|
| `recurrence !== 'none'` + `pending` | `repeat` (colorato) | Ricorrente attivo |
| `recurrence !== 'none'` + `sent` | `repeat` (muted, 40% opacity) | Ricorrente dormiente |
| `recurrence === 'none'` + `pending` | `notifications` | Singolo attivo |
| `reminderStatus === 'completed'` | `task_alt` | Evaso (invariato) |

Il `repeat` icon (Material) è immediatamente leggibile come "questo si ripete".

### 4. Interazione

Tap su nota ricorrente → apre editor come normal. Nessun comportamento speciale.
Il badge è solo informativo.

### 5. Edge case — Ricorrente + status "sent"

Appare nella sezione "Ricorrenti" con icona `repeat` muted. NON va in "Evasi".
Il tab "Evasi" rimane per sole note con `reminderStatus === 'completed'` E
`recurrence === 'none'` (reminder singolo completato manualmente dall'utente).

Note ricorrenti con `reminderStatus === 'completed'`:
- Caso raro (utente ha tappato "Mark as done" su una ricorrente)
- Comportamento proposto: mostrarla in "Evasi" con un badge `repeat` muted per
  segnalare che è ricorrente ma momentaneamente sospesa

### 6. Rinomina tab "Evasi" → "Completati"

"Evasi" è ambiguo. "Completati" è più chiaro, allineato con il pattern delle app di
riferimento (Things 3: "Logged"). Cambio puramente linguistico, nessun impatto logico.
