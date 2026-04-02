status: done
agent: beta
task: Deploy v1.4.0 — E2E encryption + fix occhiolino conferma password
completed: 2026-03-31T00:13:00Z

## Esecuzione completata
- [x] Bump versione 1.3.1 → 1.4.0 in frontend/package.json
- [x] Commit 1442f61 con changelog E2E encryption
- [x] Push su main — workflow deploy.yml attivo
- [x] Build verde (51s) — GitHub Pages deploy + notifiche push inviate

**Workflow:** https://github.com/JoWood94/punto-/actions/runs/23773969054

## Istruzioni deploy (completate)
1. Esegui `git status` — verifica tutti i file modificati
2. `git add` di TUTTI i file modificati in frontend/ e server/ (NON agents/)
3. Bump versione in `frontend/package.json`: 1.3.1 → 1.4.0
4. Commit con messaggio:

```
feat: v1.4.0 — cifratura E2E note con OpenPGP.js

- Feat: cifratura end-to-end di title/content/checklist/address con OpenPGP ECC curve25519
- Feat: passphrase di cifratura con strength indicator e validazione
- Feat: migrazione automatica note esistenti al primo accesso
- Feat: supporto multi-device via chiave privata cifrata su Firestore
- Fix: occhiolino visibilità su campo conferma password in registrazione
```

5. Push su main → workflow deploy.yml si attiva
6. Conferma build verde

## Note
- deploy autorizzato da Giuseppe (Team Lead) — 2026-03-31
- NON includere file in agents/ nel commit
- Warning budget +12KB per openpgp è atteso e non bloccante
