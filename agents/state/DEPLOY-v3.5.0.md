status: in_progress
agent: beta
task: Deploy v3.5.0 — ricorrenti overdue, persistenza evasione, fix desktop

## Autorizzazione
Deploy autorizzato da Giuseppe.

## Changelog v3.5.0

**Promemoria ricorrenti — gestione scaduti**
- Badge "Scaduto il [data]" + bottone "Evadi ricorrenza scaduta" per ricorrenze passate non evase
- Dopo evasione scaduto: bottone disabilitato "Evaso — prossima ricorrenza [data]" con icona check (nessun undo)
- Reset automatico quando anche la prossima ricorrenza scade
- `evaded`/`wasOverdue` persistiti su Firestore — stato corretto al reload
- `isOverdueRecurring` calcola effectiveTime da date+hour+minute (fix time:null e datepicker stale)

**Desktop**
- Icona menu impostazioni sempre visibile, anche con nota aperta

## Procedura
1. `git status` — verifica file modificati
2. `git add` — staggia TUTTI i file modificati (frontend/ + agents/)
3. `git commit` con messaggio "feat: v3.5.0 — ricorrenti overdue, persistenza evasione, fix desktop"
4. `git push origin main`
5. Attendi build GitHub Actions verde (sia Firebase che GitHub Pages)
6. Aggiorna questo file con `status: done` e `completed:`
