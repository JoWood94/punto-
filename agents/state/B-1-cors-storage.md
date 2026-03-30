status: blocked
agent: beta
task: Triggerare manualmente il workflow set_storage_cors.yml da GitHub Actions
bloccato_da: Verifica configurazione Firebase Storage — bucket non trovato

## Problema
- Workflow corre con bucket name corretto (`gs://punto-84646.appspot.com`)
- Errore: NotFoundException 404 — bucket non esiste o non accessibile con service account
- Runs: 23771427131 (fail), 23771462659 (fail), 23771498271 (fail)

## Azioni fatte
✅ Fixed bucket name in .github/workflows/set_storage_cors.yml
✅ Committed + pushed fix

## Prossimi passi
⛔ Attendo istruzioni Team Lead

## Note
Il workflow è già pronto in .github/workflows/set_storage_cors.yml
Dopo il completamento, Alpha rimuoverà i commenti TODO sull'upload immagini.
