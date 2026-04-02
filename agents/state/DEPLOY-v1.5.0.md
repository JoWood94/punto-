status: done
agent: beta
task: Deploy v1.5.0 — session check periodico
completed: Commit 6052233 pushato. Workflow deploy.yml completato con successo (35s). Build verde. v1.5.0 live su GitHub Pages.

## Istruzioni
1. `git status` — verifica file modificati
2. `git add` di TUTTI i file modificati in `frontend/` (NON agents/)
3. Bump versione in `frontend/package.json`: 1.4.9 → 1.5.0
4. Commit:
```
feat: v1.5.0 — session check periodico

- Feat: dashboard sottoscrive authState → redirect immediato se sessione scade
- Feat: reload utente ogni 5 min → rileva account disabilitati/eliminati/token revocati
- Cleanup: unsubscribe e clearInterval in ngOnDestroy()
```
5. Push su main → workflow deploy.yml si attiva
6. Conferma build verde e FERMATI

## ⛔ Regole assolute
- NON includere file in `agents/` nel commit
- NON inviare notifiche push
- FERMATI dopo conferma build verde

## Note
- Deploy autorizzato da Giuseppe — 2026-03-31
- Bump a v1.5.0 — milestone: E2E encryption stabile + security hardening
