status: done
agent: beta
task: Deploy v1.4.5 — fix E2E falso setup dialog + log diagnostici
completed: Commit e858127 pushato. Workflow deploy.yml completato con successo (34s). Build verde. v1.4.5 live su GitHub Pages.

## Istruzioni
1. `git status` — verifica file modificati
2. `git add` di TUTTI i file modificati in `frontend/` (NON agents/)
3. Bump versione in `frontend/package.json`: 1.4.4 → 1.4.5
4. Commit:
```
fix: v1.4.5 — fix E2E falso setup dialog su secondo device

- Fix: getUserDoc() non usa più cache stale come fallback (return null se server non raggiungibile)
- Add: log diagnostici [E2E] in initEncryption() per debug
```
5. Push su main → workflow deploy.yml si attiva
6. Conferma build verde e FERMATI

## ⛔ Regole assolute
- NON includere file in `agents/` nel commit
- NON inviare notifiche push
- FERMATI dopo conferma build verde

## Note
- Deploy autorizzato da Giuseppe — 2026-03-31
