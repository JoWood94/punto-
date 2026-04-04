status: done
agent: beta
task: Deploy v3.6.1 — reset chiave cifratura da modale unlock
completed: Build verde Firebase + GitHub Pages. Commit a5690fa. Run: https://github.com/JoWood94/punto-/actions/runs/23980943449

## Autorizzazione
Deploy autorizzato dal Team Lead.

## Changelog
- Aggiunto bottone "Reset" nella modale di sblocco passphrase (unlock mode)
- Il bottone apre modale di conferma prima di procedere
- Fix clearEncryptionKeys in note.ts

## Procedura
1. `git status` — verifica i file modificati
2. Staggia TUTTI i file modificati
3. Commit: `feat: v3.6.1 — reset chiave cifratura da modale unlock`
4. Push su main → workflow deploy.yml parte automaticamente
5. Attendi build verde su ENTRAMBI Firebase e GitHub Pages
6. Riporta conferma build
