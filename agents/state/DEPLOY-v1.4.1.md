status: done
agent: beta
task: Deploy v1.4.1 — fix E2E passphrase setup/unlock + session versioning
completed: 2026-03-31T00:26:00Z

## Esecuzione completata
- [x] Bump versione 1.4.0 → 1.4.1
- [x] Commit 6b26be6 con fix passphrase setup/unlock
- [x] Push su main — workflow deploy.yml attivo
- [x] Build verde (48s) — GitHub Pages deploy

**Workflow:** https://github.com/JoWood94/punto-/actions/runs/23774370158

## Istruzioni deploy (completate)
1. Esegui `git status` — verifica tutti i file modificati
2. `git add` di TUTTI i file modificati in frontend/ e server/ (NON agents/)
3. Bump versione in `frontend/package.json`: 1.4.0 → 1.4.1
4. Commit con messaggio:

```
fix: v1.4.1 — fix flusso E2E passphrase setup/unlock

- Fix: distinzione corretta setup vs unlock (encryptionSetup flag)
- Fix: logout forzato su sessionVersion mismatch (sicurezza multi-device)
- Feat: changePassphrase() per cambiare passphrase senza perdere le note
```

5. Push su main → workflow deploy.yml si attiva
6. Conferma build verde e FERMATI — nessuna notifica push

## Note
- deploy autorizzato da Giuseppe (Team Lead) — 2026-03-31
- NON includere file in agents/ nel commit
- NON inviare notifiche push — Giuseppe le lancerà manualmente
