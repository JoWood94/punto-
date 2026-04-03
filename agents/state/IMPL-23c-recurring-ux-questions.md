status: done
agent: alpha
task: Analisi UX note ricorrenti — evasione e visibilità

## Contesto

Il Team Lead sta progettando la gestione note ricorrenti. Prima di implementare, rispondere a queste domande analizzando il codice esistente e ragionando sul flusso UX.

## Domande da rispondere

### 1. Come funziona oggi l'evasione di una nota ricorrente?

Leggi `note-editor.component.ts` e `note.service.ts` (o equivalenti) per capire:
- Cosa succede quando l'utente preme "Evadi" su una nota con `recurrence != 'none'`
- Il campo `recurrence` viene azzerato? Rimane?
- `reminderStatus` e `reminderTime` vengono resettati?

### 2. Proposta: come distinguere "evado questa occorrenza" da "cancello la ricorrenza"

Proponi un flusso UX per gestire questi due casi separati:
- **Salta occorrenza**: l'utente ha completato il task per questa settimana, ma vuole che il promemoria ritorni la prossima. Server ha già rischedulato (`reminderTime` = prossimo slot). Come si comunica questo all'utente?
- **Annulla ricorrenza**: l'utente vuole fermare definitivamente il promemoria ricorrente. Cosa succede ai campi Firestore?

### 3. Visibilità — alternativa al tab separato

Il Team Lead teme che un tab separato "Ricorrenti" nasconda le note all'utente. Valuta queste alternative:
- **Opzione A**: note ricorrenti restano nella lista principale con badge `repeat` + chip tipo ricorrenza
- **Opzione B**: sezione collassabile "Ricorrenti" in cima alla lista principale (sopra le note normali)
- **Opzione C**: tab separato + badge contatore sul tab (come le notifiche) per attirare attenzione

Per ciascuna, indica pro/contro in 2 righe.

## Output atteso

Scrivi le risposte in questo file sotto `## Analisi`, poi `status: done`.
NON implementare nulla.

---

## Analisi

### 1. Come funziona oggi l'evasione di una nota ricorrente

Fonte: `note-editor.ts → markReminderCompleted(block)` (linee 544–560).

**Comportamento attuale:**
- `recurrence` rimane invariato (daily/weekly/monthly)
- `reminderTime` viene avanzato al prossimo slot via `getNextRecurrence()`
- `block.status` viene impostato a `'pending'` per la prossima occorrenza
- `reminderStatus: 'completed'` NON viene mai settato su note ricorrenti
- La nota **non finisce mai in "Evasi"** — resta nella lista principale

**Conferma dal template HTML** (riga 182):
```
{{ block.recurrence !== 'none' ? 'Evaso — prossimo ' + getNextRecurrenceLabel(block) : 'Segna come evaso' }}
```
Il pulsante già distingue i due casi nel testo, ma esegue solo l'avanzamento slot.

**Conseguenza chiave**: oggi "Evasi" è garantito contenere solo note con reminder singolo.
Non esiste attualmente un modo per cancellare la ricorrenza dall'editor — solo avanzarla.

---

### 2. UX per distinguere "salta occorrenza" da "cancella ricorrenza"

#### Stato attuale
Il pulsante "Evaso — prossimo [data]" esegue già "salta occorrenza" correttamente.
Manca solo "cancella ricorrenza".

#### Proposta: due azioni distinte nel reminder block

**A — Salta occorrenza** (comportamento attuale, invariato)
Pulsante primario: *"Evaso — prossimo [data]"*
→ `reminderTime` avanza, `status: 'pending'`, `recurrence` intatto.
Comunicazione all'utente già chiara: il pulsante mostra la data del prossimo trigger.

**B — Cancella ricorrenza** (nuovo)
Azione secondaria, meno prominente: link testuale o icon-button `repeat_on → repeat_off`
accanto al campo "Ripeti" nell'editor, visibile solo quando `recurrence !== 'none'`.

Al tap → modale di conferma minimale:
> "Vuoi fermare questo promemoria ricorrente?"
> [Ferma] [Annulla]

Se confermato, scrittura Firestore:
```
recurrence: 'none'
reminderStatus: null   // o 'sent' se si vuole tenerlo visibile senza riattivarlo
reminderTime: null     // oppure conservarlo per storico
```

L'entry sparisce dalla sezione "Ricorrenti" e torna come nota normale
(senza reminder, o con reminder singolo se `reminderTime` conservato).

**Punto di inserimento UI**: nella riga del campo "Ripeti", quando il valore è ≠ 'none',
mostrare una `×` o un'icona `repeat` barrata accanto al select — stesso pattern del campo
cerca note (già usa un pulsante `×` inline quando c'è testo).

---

### 3. Visibilità — Pro/Contro delle tre opzioni

**Opzione A — Badge `repeat` inline nella lista principale**
✅ Zero friction: le note ricorrenti restano dove l'utente le cerca, il badge informa senza
   separare. Coerente con il design editoriale (un glifo, un significato).
⚠️ Se l'utente ha molte note ricorrenti, non c'è un modo rapido per vedere "solo le ricorrenti"
   senza scorrere tutta la lista.

**Opzione B — Sezione collassabile "Ricorrenti" in cima**
✅ Raggruppa le ricorrenti rendendole immediatamente visibili; pattern già noto (Fissate).
   Collassabile = non occupa spazio se l'utente non è interessato.
⚠️ Introduce un secondo punto di verità: la nota appare nella sezione Ricorrenti E potrebbe
   essere attesa anche nella lista normale → rischio confusione se non si esclude dal listing
   principale (che richiede logica filtro aggiuntiva).

**Opzione C — Tab separato + badge contatore**
✅ Separazione netta: chi vuole gestire ricorrenti sa dove andare; badge = discoverability
   garantita anche senza navigare al tab.
⚠️ Navigation cost aggiunto; badge counter su tab è rumore se le ricorrenti sono poche (1–3).
   Rischio "tab fantasma" mai visitato dall'utente medio.

**Raccomandazione**: Opzione A come baseline (minimal, zero costo cognitivo), con Opzione B
opzionale se il numero di note ricorrenti cresce. Opzione C da evitare: aggiunge complessità
navigazionale per un feature usato raramente.
