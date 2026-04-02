status: done
agent: beta
task: Deploy v1.4.3 — fix root cause E2E multi-device
completed: 2026-03-31T01:09:00Z

## Esecuzione completata
- [x] Bump versione 1.4.2 → 1.4.3
- [x] Commit a105765 con fix root cause E2E unlock + logout real-time
- [x] Push su main — workflow deploy.yml attivo
- [x] Build verde (40s) — GitHub Pages deploy

**Workflow:** https://github.com/JoWood94/punto-/actions/runs/23775544790

## Istruzioni deploy (completate)
1. Esegui `git status` — verifica tutti i file modificati
2. `git add` di TUTTI i file modificati in frontend/ e server/ (NON agents/)
3. Bump versione in `frontend/package.json`: 1.4.2 → 1.4.3
4. Commit con messaggio:

```
fix: v1.4.3 — fix root cause E2E multi-device unlock + logout forzato

- Fix: getDocFromServer() per evitare cache stale su nuovo device (encryptionSetup non visibile)
- Fix: onSnapshot callback logout garantito anche su eccezione (.catch().finally())
- Fix: backward compat unlock — controlla encryptedPrivateKey + publicKey se encryptionSetup assente
```

5. Push su main → workflow deploy.yml si attiva
6. Conferma build verde e FERMATI — nessuna notifica push

## Note
- deploy autorizzato da Giuseppe (Team Lead) — 2026-03-31
- NON includere file in agents/ nel commit
- NON inviare notifiche push
