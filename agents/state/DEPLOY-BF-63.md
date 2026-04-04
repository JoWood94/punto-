status: in_progress
agent: beta
task: Deploy BF-63 + notifica test al solo UID W42XL7UVYFRMakpZJdrpcGkgsQr1

## Deploy autorizzato — PRIORITÀ

1. `git status` — verifica tutti i file modificati (server/ + frontend/public/)
2. Staggia TUTTI i file modificati
3. Commit: "fix: notifiche promemoria — aggiungi notification payload, rimuovi onBackgroundMessage (BF-63)"
4. Push → attendi build verde su Firebase + GitHub Pages
5. Triggera workflow `notify-single-user.yml` con `target_uid=W42XL7UVYFRMakpZJdrpcGkgsQr1`
6. Conferma risultato notifica
