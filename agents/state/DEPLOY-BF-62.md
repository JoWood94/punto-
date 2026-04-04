status: in_progress
agent: beta
task: Deploy BF-62 — FCM token retry strategy

## Deploy autorizzato

1. `git status` — verifica tutti i file modificati
2. Staggia TUTTI i file modificati
3. Commit: "fix: FCM token — deleteToken solo come fallback se getToken fallisce (BF-62)"
4. Push → attendi build verde su Firebase + GitHub Pages
5. Conferma deploy OK. NON triggerare notifica.
