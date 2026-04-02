status: done
agent: beta
task: Deploy v1.4.8 — fix login error messages + password recovery feedback
completed: Commit 2741e87 pushato. Workflow deploy.yml completato con successo (41s). Build verde. v1.4.8 live su GitHub Pages.

## Istruzioni
1. `git status` — verifica file modificati
2. `git add` di TUTTI i file modificati in `frontend/` (NON agents/)
3. Bump versione in `frontend/package.json`: 1.4.7 → 1.4.8
4. Commit:
```
fix: v1.4.8 — messaggi di errore login + feedback password recovery

- Fix: errori Firebase mostrati all'utente in UI (credenziali errate, email non trovata, ecc.)
- Fix: conferma visiva invio email recupero password
- Fix: reset messaggi ad ogni nuovo tentativo
```
5. Push su main → workflow deploy.yml si attiva
6. Conferma build verde e FERMATI

## ⛔ Regole assolute
- NON includere file in `agents/` nel commit
- NON inviare notifiche push
- FERMATI dopo conferma build verde

## Note
- Deploy autorizzato da Giuseppe — 2026-03-31
