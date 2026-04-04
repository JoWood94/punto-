status: done
agent: beta
task: Deploy v3.6.2 — fix modale passphrase unlock
completed: Build verde Firebase + GitHub Pages. Commit 1757788. Run: https://github.com/JoWood94/punto-/actions/runs/23981056824

## Autorizzazione
Deploy autorizzato dal Team Lead.

## Changelog
- Rimosso bottone "Annulla" in modalità unlock (era bypassabile)
- Enter sul campo passphrase conferma lo sblocco

## Procedura
1. `git status` — verifica i file modificati
2. Staggia TUTTI i file modificati
3. Commit: `fix: v3.6.2 — passphrase unlock non bypassabile + Enter per sbloccare`
4. Push su main → workflow deploy.yml parte automaticamente
5. Attendi build verde su ENTRAMBI Firebase e GitHub Pages
6. Riporta conferma build
