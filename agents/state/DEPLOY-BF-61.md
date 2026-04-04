status: in_progress
agent: beta
task: Deploy BF-61 + notifica specifica al solo UID W42XL7UVYFRMakpZJdrpcGkgsQr1

## Step 1 — Aggiorna messaggio notifica
In `server/send-notif-single-user.js` aggiorna title e body (sia in `notification` che in `data`):
- title: `"punto! — Fix promemoria"`
- body: `"Il badge scaduto duplicato è stato rimosso. Chiudi e riapri l'app per aggiornare."`

## Step 2 — Deploy
1. `git status` — verifica tutti i file modificati
2. Staggia TUTTI i file modificati (frontend + server)
3. Commit: `"fix: badge scaduto duplicato nel reminder block (BF-61)"`
4. Push → attendi build verde su Firebase + GitHub Pages

## Step 3 — Notifica
Dopo build verde, triggera il workflow `notify-single-user.yml` con `target_uid=W42XL7UVYFRMakpZJdrpcGkgsQr1`.
Conferma risultato.
