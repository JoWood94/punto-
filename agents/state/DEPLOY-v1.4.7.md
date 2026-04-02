status: done
agent: beta
task: Deploy v1.4.7 — fix E2E keypair generation (Invalid user ID format)
completed: Commit 073bbe8 pushato. Workflow deploy.yml completato con successo (37s). Build verde. v1.4.7 live su GitHub Pages.

## Istruzioni
1. `git status` — verifica file modificati
2. `git add` di TUTTI i file modificati in `frontend/` (NON agents/)
3. Bump versione in `frontend/package.json`: 1.4.6 → 1.4.7
4. Commit:
```
fix: v1.4.7 — fix E2E keypair generation (Invalid user ID format)

- Fix: crypto.ts userIDs: [{ email: uid }] → [{ name: uid }]
  OpenPGP.js richiede email valida; il Firebase UID non lo è → keypair mai generata
```
5. Push su main → workflow deploy.yml si attiva
6. Conferma build verde e FERMATI

## ⛔ Regole assolute
- NON includere file in `agents/` nel commit
- NON inviare notifiche push
- FERMATI dopo conferma build verde

## Note
- Deploy autorizzato da Giuseppe — 2026-03-31
