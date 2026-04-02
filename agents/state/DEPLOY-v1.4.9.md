status: done
agent: beta
task: Deploy v1.4.9 — fix registrazione E2E setup + verifica email obbligatoria
completed: Commit 6a92824 pushato. Workflow deploy.yml completato con successo (34s). Build verde. v1.4.9 live su GitHub Pages.

## Istruzioni
1. `git status` — verifica file modificati
2. `git add` di TUTTI i file modificati in `frontend/` (NON agents/)
3. Bump versione in `frontend/package.json`: 1.4.8 → 1.4.9
4. Commit:
```
fix: v1.4.9 — E2E setup nuovo utente + verifica email obbligatoria

- Fix: initEncryption() mostra setup dialog a nuovo utente senza userDoc
- Fix: registrazione invia email di verifica + logout automatico
- Fix: authGuard blocca accesso dashboard se email non verificata
```
5. Push su main → workflow deploy.yml si attiva
6. Conferma build verde e FERMATI

## ⛔ Regole assolute
- NON includere file in `agents/` nel commit
- NON inviare notifiche push
- FERMATI dopo conferma build verde

## Note
- Deploy autorizzato da Giuseppe — 2026-03-31
