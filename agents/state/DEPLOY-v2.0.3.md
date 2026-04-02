status: done
agent: beta
task: Deploy v2.0.3 — fix iOS keyboard layout + fix larghezza blocco TESTO

## Changelog v2.0.3
- fix: iOS keyboard layout — :host height vincolato a --vh, editor-content padding bottom corretto (BF-17)
- fix: blocco TESTO ora occupa tutta la larghezza disponibile su mobile (BF-18)

## Istruzioni

1. `git status` — verifica file modificati
2. `git add` SOLO i file frontend modificati:
   - `frontend/src/app/components/note-editor/note-editor.html`
   - `frontend/src/app/components/note-editor/note-editor.scss`
   - `frontend/src/app/components/note-editor/note-editor.ts`
   - `frontend/src/styles.scss`
   (qualsiasi altro file in `frontend/` risulti modificato va incluso — NON includere nulla in `agents/`)
3. Bump versione in `frontend/package.json`: `2.0.2` → `2.0.3` e aggiungi al staging
4. Commit:
```
fix: v2.0.3 — iOS keyboard layout + text block width

- fix: :host height vincolato a var(--vh) per layout corretto con tastiera iOS
- fix: editor-content padding-bottom include safe-area + toolbar offset
- fix: rich-text-wrapper flex:1 — blocco TESTO ora full-width su mobile
```
5. Push su `main` → attendi build verde del workflow `deploy.yml`
6. Notifica push a TUTTI gli utenti con FCM token in Firestore:
   - Leggi tutti i documenti `users/{uid}` che hanno `fcmTokens` non vuoto
   - Invia FCM multicast con testo: `"punto! v2.0.3 — fix layout tastiera iOS e blocchi TESTO"`
   - Puoi usare la stessa logica di `server/index.js` o scrivere uno script one-shot
7. Conferma build verde + notifica inviata, poi FERMATI

## ⛔ Regole assolute
- NON includere file in `agents/` nel commit
- FERMATI dopo conferma build verde + notifica inviata

## Note
- Deploy autorizzato da Giuseppe — 2026-04-01
completed: Commit af378d5. Build deploy.yml verde. Notifiche inviate via send-notification.yml (run 23860998547).
bloccato_da:
