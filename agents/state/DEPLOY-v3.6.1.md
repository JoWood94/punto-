status: in_progress
agent: beta
task: Deploy v3.6.1 — reset chiave cifratura da modale unlock

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
