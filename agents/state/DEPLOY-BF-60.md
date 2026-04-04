status: in_progress
agent: beta
task: Deploy BF-60 — FCM token fix (deleteToken + getToken)

## Deploy autorizzato da Giuseppe

Esegui:
1. `git status` — verifica tutti i file modificati (non solo agents/)
2. Staggia TUTTI i file modificati
3. Commit: "fix: FCM token stale — deleteToken prima di getToken per subscription fresca"
4. Push → attendi build verde su entrambi Firebase e GitHub Pages
5. Conferma deploy OK
