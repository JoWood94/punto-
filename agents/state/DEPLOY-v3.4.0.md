status: in_progress
agent: beta
task: Deploy v3.4.0 — ricorrenti, encryption, UX fixes

## Autorizzazione
Deploy autorizzato da Giuseppe.

## File modificati da committare
```
frontend/src/app/components/dashboard/dashboard.html
frontend/src/app/components/dashboard/dashboard.scss
frontend/src/app/components/dashboard/dashboard.ts
frontend/src/app/components/note-editor/note-editor.html
frontend/src/app/components/note-editor/note-editor.ts
frontend/src/app/components/passphrase-dialog/passphrase-dialog.ts
frontend/src/app/components/settings/settings.component.html
frontend/src/app/services/note.ts
frontend/src/styles.scss
agents/ (inbox, state files)
```

## Changelog v3.4.0

**Promemoria ricorrenti**
- Sezione "Ricorrenti" nel dashboard con prossima occorrenza
- Bottone "Segna come evaso" sempre visibile — avanza alla prossima occorrenza
- Badge "Evaso — prossima [data]" con undo dopo il click
- Transizione automatica al giorno successivo (localStorage flag per occorrenza)
- Modale evasione rimossa — workflow diretto

**Encryption**
- sessionVersion incrementa correttamente dopo reset (era hardcodato a 1)
- Mismatch sessionVersion: reload + richiesta passphrase invece di logout

**Dashboard**
- Vista di default caricata da localStorage — nessun flash
- Desktop: calendario sempre visibile a destra quando nessuna nota è selezionata
- Sezioni Ricorrenti/Fissate/Note collassabili

**Impostazioni**
- Label "Vista di default" (era "Interfaccia mobile")
- Fix posizione menu desktop

**UX / fix**
- Notifica con titolo nota se `notifTitleEnabled` attivo (server già deployato)
- Menu impostazioni: primo item non più evidenziato all'apertura
- Icona calendario senza dot indicator
- Fix empty state "+ Nuova nota"

## Procedura
1. `git status` — verifica file modificati
2. `git add` — staggia TUTTI i file modificati (frontend/ + agents/)
3. `git commit` con messaggio "feat: v3.4.0 — ricorrenti, encryption, UX fixes"
4. `git push origin main`
5. Attendi build GitHub Actions verde
6. Aggiorna questo file con `status: done` e `completed:`
