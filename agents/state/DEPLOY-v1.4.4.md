status: done
agent: beta
task: Deploy v1.4.4 — fix E2E sessionVersion check al mount
completed: Commit 2cc3bc6 pushato. Workflow deploy.yml completato con successo (47s). Build verde. v1.4.4 live su GitHub Pages.

## Istruzioni
1. `git status` — verifica file modificati
2. `git add` di TUTTI i file modificati in `frontend/` (NON agents/)
3. Bump versione in `frontend/package.json`: 1.4.3 → 1.4.4
4. Commit:
```
fix: v1.4.4 — fix E2E sessionVersion check al mount

- Fix: initEncryption() confronta localVersion vs remoteVersion PRIMA di salvarla
- Fix: logout immediato se sessionVersion diverge (chiusura+riapertura tab/PWA)
```
5. Push su main → workflow deploy.yml si attiva
6. Conferma build verde e FERMATI

## ⛔ Regole assolute
- NON includere file in `agents/` nel commit
- NON inviare notifiche push — nessun changelog, nessuna notifica agli utenti
- FERMATI dopo la conferma build verde

## Note
- Deploy autorizzato da Giuseppe — 2026-03-31
