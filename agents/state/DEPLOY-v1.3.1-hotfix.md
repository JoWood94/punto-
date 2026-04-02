status: done
agent: beta
task: Commit modifiche non incluse nel deploy v1.3.1 + redeploy
completed: 2026-03-31T00:10:30Z

## Problema
Il deploy v1.3.1 (commit a6051c6) conteneva solo il bump di package.json.
Tutte le modifiche di Alpha sono rimaste uncommitted nella working directory.

## Cosa fare

1. Verifica che i seguenti file abbiano modifiche non committate:
   - frontend/src/app/components/dashboard/dashboard.ts
   - frontend/src/app/components/dashboard/dashboard.html
   - frontend/src/app/components/dashboard/dashboard.scss
   - frontend/src/app/components/calendar-view/calendar-view.component.ts
   - frontend/src/app/components/calendar-view/calendar-view.component.html
   - frontend/src/app/components/note-editor/note-editor.html
   - frontend/src/app/components/note-editor/note-editor.ts
   - frontend/src/app/services/note.ts
   - frontend/public/firebase-messaging-sw.js
   - server/index.js

2. Fai `git add` di tutti i file frontend/ e server/ modificati (NON agents/)

3. Commit con messaggio:
   ```
   feat: v1.3.1 — swipe mobile, note pinnate, promemoria ricorrenti, fix UX

   - Feat: swipe mobile lista ↔ calendario
   - Feat: divisore visivo note fissate / normali
   - Feat: promemoria ricorrenti nel calendario (daily/weekly/monthly/yearly)
   - Fix: deep link notifiche push → apertura nota corretta
   - Fix: layout promemoria desktop
   - Fix: backspace titolo non naviga indietro
   - Fix: tap target pin/delete mobile
   - Fix: CSS budget — 0 warning in build
   ```

4. Push su main → workflow deploy.yml si attiva automaticamente

5. Conferma build verde

## Note
- deploy autorizzato da Giuseppe (Team Lead) — 2026-03-31
- NON aggiungere file in agents/ al commit
