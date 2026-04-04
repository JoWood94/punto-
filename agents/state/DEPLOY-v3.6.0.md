status: in_progress
agent: beta
task: Deploy v3.6.0 — fix notifiche titolo + badge scaduto + bottone evadi

## Autorizzazione
Deploy autorizzato dal Team Lead.

## Changelog
- BF-54: bottone "Evadi" visibile subito sulle note nuove (fix this.note.id)
- BF-55: titolo notifica in chiaro quando notifTitleEnabled=true (fix encryptNote skipFields)
- BF-56: notifTitleEnabled sincronizzato a NoteService all'apertura impostazioni
- BF-57: badge "Scaduto il [data]" per promemoria singoli non-ricorrenti
- Fix: badge scaduto appare dopo 1 minuto dall'orario (grace period)
- Fix: evasione ricorrente usa orario UI aggiornato, non block.time stale

## Procedura
1. `git status` — verifica i file modificati
2. Staggia TUTTI i file modificati (frontend/, agents/ — tutto)
3. Commit: `feat: v3.6.0 — fix notifiche titolo + badge scaduto + bottone evadi`
4. Push su main → il workflow deploy.yml parte automaticamente
5. Attendi build verde su ENTRAMBI Firebase e GitHub Pages
6. Riporta URL del run GitHub Actions e conferma deploy

## ⚠️ Attenzione
Il workflow deploy.yml fa DUE build separate:
- Firebase: `--base-href /` → dist/firebase
- GitHub Pages: `--base-href /punto-/` → dist/ghpages
Non toccare deploy.yml.
