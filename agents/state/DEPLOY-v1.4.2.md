status: done
agent: beta
task: Deploy v1.4.2 — fix E2E multi-device + logout forzato real-time
completed: 2026-03-31T00:37:00Z

## Esecuzione completata
- [x] Bump versione 1.4.1 → 1.4.2
- [x] Commit 5b13e93 con fix E2E unlock + logout real-time
- [x] Push su main — workflow deploy.yml attivo
- [x] Build verde (49s) — GitHub Pages deploy

**Workflow:** https://github.com/JoWood94/punto-/actions/runs/23774662433

## Istruzioni deploy (completate)
1. Esegui `git status` — verifica tutti i file modificati
2. `git add` di TUTTI i file modificati in frontend/ e server/ (NON agents/)
3. Bump versione in `frontend/package.json`: 1.4.1 → 1.4.2
4. Commit con messaggio:

```
fix: v1.4.2 — fix E2E multi-device unlock + logout forzato real-time

- Fix: secondo dispositivo mostra correttamente unlock invece di setup
- Fix: logout forzato real-time su sessionVersion mismatch (onSnapshot users/{uid})
- Fix: gestione offline — nessun dialog improprio se getUserDoc ritorna null
```

5. Push su main → workflow deploy.yml si attiva
6. Conferma build verde e FERMATI — nessuna notifica push

## Note
- deploy autorizzato da Giuseppe (Team Lead) — 2026-03-31
- NON includere file in agents/ nel commit
- NON inviare notifiche push
