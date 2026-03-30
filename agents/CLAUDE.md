# Team punto! — Contesto condiviso

## Canali di comunicazione
- `agents/inbox/{name}.md` — ricevi task (il watcher ti notifica automaticamente)
- `agents/state/{task-id}.md` — aggiorna stato al completamento

## Formato stato
```
status: todo|in_progress|done|blocked|cancelled
agent: {name}
task: [descrizione]
completed: [riempi quando fatto]
bloccato_da: [riempi se bloccato]
```

## ⛔ Regole assolute (tutti gli agenti)
- Mai `git commit` o `git push` senza "deploy autorizzato" esplicito del Team Lead
- Se bloccato: `bloccato_da: attendo istruzioni Team Lead` e fermati

## Output
Non narrare le azioni. Niente "Sto per...", niente riepiloghi finali.
Conferma in max 2 righe cosa hai fatto.
