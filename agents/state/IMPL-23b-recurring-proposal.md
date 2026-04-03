status: done
agent: alpha
task: Proposta design categoria note ricorrenti (seguito IMPL-23)

## Contesto
IMPL-23 è stato chiuso senza la proposta. Questo task la richiede esplicitamente.

## Cosa fare

1. Usa `impeccable:critique` per valutare il flusso reminder attuale (lista note, tab evasi, editor reminder)
2. Usa `impeccable:frontend-design` per esplorare il design della nuova categoria ricorrenti
3. Scrivi la proposta qui sotto rispondendo a tutte e 5 le domande

## Proposta da scrivere

Aggiungi una sezione `## Proposta` a questo file con:

1. **Struttura**: nuova tab "Ricorrenti" nella bottom nav oppure sezione inline nella lista note?
2. **Contenuto**: solo `recurrence != 'none'`, o anche note con reminder `pending` non ricorrenti?
3. **Visivo**: come si distingue una nota ricorrente nella card (icona? badge? colore?)
4. **Interazione**: tap su nota ricorrente → apre editor normale? o vista dedicata?
5. **Edge case**: nota ricorrente con `reminderStatus: 'sent'` (in attesa del prossimo slot) → dove appare e cosa mostra?

## ⛔ NO implementazione — solo proposta testuale

---

## Proposta

### 1. Struttura — Sezione inline nella lista, NON nuova tab

Una sezione "Ricorrenti" contestuale sopra le note normali (dopo "Fissate"), visibile
solo quando esistono note con `recurrence !== 'none'`.

**Motivazione**: una tab separata aggiunge un livello di navigazione per una feature
che riguarda poche note. Il pattern sezione inline ("Fissate" → "Ricorrenti" → "Note")
è già noto all'utente, ha zero navigation cost, e mantiene la lista unificata.

```
─────────────────
  FISSATE          ← se presenti
─────────────────
  nota A
─────────────────
  RICORRENTI       ← se recurrence !== 'none'
─────────────────
  nota B  🔁
  nota C  🔁
─────────────────
  NOTE
─────────────────
  nota D
  nota E
```

---

### 2. Contenuto — Solo `recurrence !== 'none'`

La sezione "Ricorrenti" mostra esclusivamente note con `recurrence !== 'none'`,
indipendentemente da `reminderStatus`. Le note con reminder singolo (`pending` o `sent`)
restano nella sezione "Note" normale.

**Motivazione**: mescolare reminder singoli e ricorrenti nella stessa sezione dilata
il contenuto e confonde il significato. "Ricorrenti" deve significare una sola cosa:
questa nota riscatterà periodicamente.

---

### 3. Visivo — Icona `repeat` contestuale sulla card

Aggiungere l'icona Material `repeat` (18px) accanto al titolo, al posto o in aggiunta
alla bell, con intensità variabile per comunicare lo stato:

| Stato | Icona | Trattamento visivo |
|---|---|---|
| `recurrence !== 'none'` + `pending` | `repeat` | colore primario (#1C1B1F), piena opacity |
| `recurrence !== 'none'` + `sent` | `repeat` | opacity 35%, comunicato come "dormiente" |
| `recurrence === 'none'` + `pending` | `notifications` | invariato |
| `reminderStatus === 'completed'` | `task_alt` | invariato |

Nessun badge colorato, nessuna pill: l'icona sola basta. Coerente con l'approccio
editoriale dell'app (un glifo, un significato).

---

### 4. Interazione — Editor normale

Tap su nota ricorrente → apre l'editor come qualsiasi altra nota. Nessuna vista dedicata.

**Motivazione**: la ricorrenza è una proprietà della nota, non un tipo diverso di oggetto.
L'utente che apre una nota ricorrente vuole leggere/editare il contenuto, non gestire
un calendario. La logica di scheduling rimane nell'editor (reminder block).

---

### 5. Edge case — Ricorrente con `reminderStatus: 'sent'`

**Dove appare**: nella sezione "Ricorrenti" della lista principale.
**Come appare**: icona `repeat` muted (opacity 35%) — comunica "attiva ma dormiente,
riscatterà al prossimo slot".
**NON appare** in "Evasi" / "Completati".

**Logica "Evasi" (→ rinominare in "Completati")**:
- Include solo note con `reminderStatus === 'completed'` E `recurrence === 'none'`
- Nota ricorrente marcata manualmente come completata: appare in "Completati" con
  icona `repeat` muted per segnalare che è ricorrente e potrebbe tornare attiva

**Rinomina**: "Evasi" → "Completati". Linguisticamente più chiaro, allineato con
il concetto di task completata. Zero impatto sulla logica esistente.
