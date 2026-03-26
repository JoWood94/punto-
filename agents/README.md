# Sistema Agenti — punto!

## Team Lead
Sono io (Claude) il team lead. Gestisco la tasklist, assegno i task, verifico il completamento e triggero il deploy.
L'utente si interfaccia solo con me.

---

## Agent Alpha — Full-Stack Angular
**Responsabilità:** Qualsiasi cambiamento al frontend Angular (TS, HTML, SCSS, services).
Nessun split artificiale tra logica e UI: ogni feature viene sviluppata in modo verticale.
**File di competenza:** `frontend/src/app/**`

## Agent Beta — DevOps & QA
**Responsabilità:** Build, test automatici (Playwright), CI/CD, deploy.
**File di competenza:** `.github/workflows/**`, `angular.json`, `server/**`, `e2e/**`

---

## Protocollo State Files
Ogni task ha un file in `agents/state/{task-id}.md`.
Formato:
```
status: todo | in_progress | done | blocked
agent: alpha | beta
completato: [cosa è stato fatto]
bloccato_da: [se blocked, motivo]
```

Quando un agente completa un task, aggiorna il file a `status: done` e scrive cosa ha fatto.
Il Team Lead legge i file di stato per orchestrare il lavoro e decidere quando fare deploy.

---

## Deploy Policy
Il deploy viene triggerato solo quando TUTTI i task della tasklist corrente sono `status: done`.
Il deploy è eseguito da Agent Beta via push su `main` → GitHub Actions → GitHub Pages.
