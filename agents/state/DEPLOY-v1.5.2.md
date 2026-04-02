status: done
agent: beta
task: Deploy v1.5.2 — loader login + lista note
completed: Commit ba9f823 pushato. Workflow deploy.yml completato con successo (40s). Build verde. v1.5.2 live su GitHub Pages.

## Istruzioni
1. `git status` — verifica file modificati
2. `git add` di TUTTI i file modificati in `frontend/` (NON agents/)
3. Bump versione in `frontend/package.json`: 1.5.1 → 1.5.2
4. Commit:
```
feat: v1.5.2 — loader login + lista note

- Feat: spinner sul bottone login/registrazione/recovery durante le chiamate
- Feat: spinner lista note durante il primo caricamento
- Colore: primary (#1C1B1F) coerente con il brand
```
5. Push su main → workflow deploy.yml si attiva
6. Conferma build verde e FERMATI

## ⛔ Regole assolute
- NON includere file in `agents/` nel commit
- NON inviare notifiche push
- FERMATI dopo conferma build verde

## Note
- Deploy autorizzato da Giuseppe — 2026-03-31
