status: done
agent: beta
task: Deploy v1.4.6 — E2E setup error surfacing + log diagnostici
completed: Commit 3eb8b3c pushato. Workflow deploy.yml completato con successo (44s). Build verde. v1.4.6 live su GitHub Pages.

## Istruzioni
1. `git status` — verifica file modificati
2. `git add` di TUTTI i file modificati in `frontend/` (NON agents/)
3. Bump versione in `frontend/package.json`: 1.4.5 → 1.4.6
4. Commit:
```
fix: v1.4.6 — E2E setup error surfacing + log diagnostici

- Fix: showSetupDialog() log granulari step-by-step (generazione chiavi, salvataggio Firestore)
- Fix: snackbar visibile all'utente se setup fallisce
- Fix: saveEncryptionKeys() lancia eccezione su uid mancante invece di silent return
```
5. Push su main → workflow deploy.yml si attiva
6. Conferma build verde e FERMATI

## ⛔ Regole assolute
- NON includere file in `agents/` nel commit
- NON inviare notifiche push
- FERMATI dopo conferma build verde

## Note
- Deploy autorizzato da Giuseppe — 2026-03-31
