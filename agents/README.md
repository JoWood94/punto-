# Sistema Agenti — punto!

## Sistema event-driven (file watcher)

La comunicazione avviene tramite file watch — nessuna dipendenza esterna, solo Node.js nativo.

### Flusso
```
Team Lead scrive inbox/alpha.md
  → watcher alpha.js si sveglia
  → lancia `claude -p` con il task
  → scrive risposta in inbox/alpha.response.md
  → watch-lead.js notifica il Team Lead
```

### Avvio watcher (ogni terminale agente)
```bash
# Terminale Alpha
node agents/scripts/watch-agent.js alpha

# Terminale Beta
node agents/scripts/watch-agent.js beta

# Terminale Gamma
node agents/scripts/watch-agent.js gamma
```

### Avvio watcher Team Lead (terminale principale)
```bash
node agents/scripts/watch-lead.js
```

### Inviare un task da Team Lead
```bash
# Testo diretto
node agents/scripts/send-task.js alpha "Rimuovi i TODO sull'upload immagini in note-editor"

# Da file di stato
node agents/scripts/send-task.js beta --file agents/state/B-1-cors-storage.md
```

### File coinvolti
```
agents/inbox/
├── alpha.md             ← Team Lead scrive qui per Alpha
├── alpha.response.md    ← Alpha scrive la risposta qui
├── alpha.seen           ← checksum interno (non toccare)
├── beta.md / beta.response.md
└── gamma.md / gamma.response.md
```

---

## Come avviare il team (3 terminali separati)

| Terminale | Agente | Prompt di avvio |
|-----------|--------|-----------------|
| 1 (questo) | **Team Lead** | `Sei il Team Lead di punto!. Leggi agents/context/team-lead.md e dimmi quando sei pronto.` |
| 2 | **Agent Alpha** | `Sei Agent Alpha. Leggi agents/context/alpha.md e dimmi quando sei pronto.` |
| 3 | **Agent Beta** | `Sei Agent Beta. Leggi agents/context/beta.md e dimmi quando sei pronto.` |
| 4 | **Agent Gamma** | `Sei Agent Gamma. Leggi agents/context/gamma.md e dimmi quando sei pronto.` |

Ogni agente legge il suo file di contesto e risponde "pronto". Da quel momento il Team Lead assegna i task.

---

## Ruoli

### Team Lead (Claude — terminale principale)
- Unico interlocutore con l'utente (Giuseppe)
- Assegna task scrivendo/aggiornando `agents/state/{task-id}.md`
- Verifica completamento leggendo i file di stato
- Trigera deploy solo quando tutti i task sono `status: done`

### Agent Alpha — Full-Stack Angular
- Implementa TS + HTML + SCSS per ogni feature
- File: `frontend/src/app/**`
- Contesto: `agents/context/alpha.md`

### Agent Beta — DevOps & QA
- Build, test, CI/CD, deploy, infrastruttura
- File: `.github/workflows/**`, `server/**`, `e2e/**`
- Contesto: `agents/context/beta.md`

### Agent Gamma — Visual QA
- Screenshot Playwright + analisi bug visivi
- File: `e2e/**`, `agents/gamma-reports/**`
- Contesto: `agents/context/gamma.md`

---

## Protocollo State Files

Ogni task ha un file `agents/state/{task-id}.md`:

```
status: todo | in_progress | done | blocked
agent: alpha | beta | gamma
task: [descrizione]
completato: [cosa è stato fatto — compilare a done]
bloccato_da: [se blocked, motivo]
```

---

## Deploy Policy
- Deploy solo quando TUTTI i task assegnati sono `status: done`
- Beta esegue il push → GitHub Actions → GitHub Pages
- Notifica versione: solo su richiesta esplicita del Team Lead

---

## Directory
```
agents/
├── README.md                  # questo file
├── context/
│   ├── alpha.md               # onboarding Agent Alpha
│   ├── beta.md                # onboarding Agent Beta
│   └── gamma.md               # onboarding Agent Gamma
├── state/
│   └── {task-id}.md           # stato di ogni task
└── gamma-reports/
    ├── INDEX.md               # indice report QA
    └── GAMMA-{N}-{data}.md    # report singolo
```
