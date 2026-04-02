status: done
agent: beta
task: Deploy v1.5.1 — fix authState null redirect loop
completed: Commit 174dec3 pushato. Workflow deploy.yml completato con successo (35s). Build verde. v1.5.1 live su GitHub Pages.

## Istruzioni
1. `git status` — verifica file modificati
2. `git add` di TUTTI i file modificati in `frontend/` (NON agents/)
3. Bump versione in `frontend/package.json`: 1.5.0 → 1.5.1
4. Commit:
```
fix: v1.5.1 — fix authState null al primo tick → redirect loop login

- Fix: skip(1) su user$ subscription — authGuard gestisce check iniziale
```
5. Push su main → workflow deploy.yml si attiva
6. Conferma build verde e FERMATI

## ⛔ Regole assolute
- NON includere file in `agents/` nel commit
- NON inviare notifiche push
- FERMATI dopo conferma build verde

## Note
- Deploy autorizzato da Giuseppe — 2026-03-31
