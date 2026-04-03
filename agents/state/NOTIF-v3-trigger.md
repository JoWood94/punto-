status: done
agent: beta
task: Triggera manualmente il workflow GitHub Actions "Send User Notification" (send-notification.yml) con questi parametri:
  - title: "punto! v3.0.0"
  - body: "Nuova interfaccia, più funzionalità. Chiudi l'app dal selettore e riapri per aggiornare."
Usa: gh workflow run send-notification.yml -f title="punto! v3.0.0" -f body="Nuova interfaccia, più funzionalità. Chiudi l'app dal selettore e riapri per aggiornare."
Poi verifica che il run parta verde con: gh run list --workflow=send-notification.yml --limit=1
completed: Workflow triggerato — run 23938386151 in queued (https://github.com/JoWood94/punto-/actions/runs/23938386151)
bloccato_da:
