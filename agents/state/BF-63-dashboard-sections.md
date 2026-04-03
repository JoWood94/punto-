status: done
agent: alpha
task: Fix sezioni dashboard — header Note, Fissate rotto, collassabilità uniforme

## Bug da IMPL-24

### Bug 1 — Manca header sezione "Note"
La sezione note normali non ha un header/label "Note" come "Ricorrenti".
Aggiungere header collassabile "Note" prima della lista note normali.

### Bug 2 — Sezione "Fissate" rotta
Fissare una nota non crea più la sezione "Fissate" separata.
IMPL-24 ha probabilmente rotto il filtro `pinnedNotes`/`unpinnedNotes`.
Verificare il getter e ripristinare la sezione "Fissate" con header collassabile.

### Bug 3 — Coerenza collassabilità
Se "Ricorrenti" è collassabile, anche "Fissate" e "Note" devono esserlo.
Applicare lo stesso pattern `.section-header-collapsible` a tutte e tre le sezioni.

## Struttura finale attesa

```
[Ricorrenti ▼]          ← collassabile, solo se ci sono ricorrenti
  card ricorrente 1
  card ricorrente 2

[Fissate ▼]             ← collassabile, solo se ci sono note fissate
  card fissata 1

[Note ▼]                ← collassabile, sempre visibile se ci sono note normali
  card nota 1
  card nota 2
```

## Note implementative
- Leggere `dashboard.ts` e `dashboard.html` prima di modificare
- Aggiungere `isPinnedSectionExpanded = true` e `isNotesSectionExpanded = true`
- Le sezioni vuote non mostrano l'header (già gestito per Ricorrenti — replicare per le altre)
- Usare `impeccable:arrange` per verificare spacing e gerarchia visiva tra le sezioni

## Output atteso
- Fix in `dashboard.ts`, `dashboard.html`, `dashboard.scss`
- Build production OK
- Aggiorna questo file con `status: done` e `completed:`

## ⛔ NO deploy — attendo validazione Giuseppe in locale
completed: dashboard.ts: aggiunti isPinnedSectionExpanded + isNotesSectionExpanded = true. dashboard.html: sostituita logica "Fissate/Lista unica" con due sezioni collassabili indipendenti — "Fissate" (se pinnedNotes.length > 0) e "Note" (se unpinnedNotes.length > 0), stesso pattern .section-header-collapsible di Ricorrenti. Build OK.
