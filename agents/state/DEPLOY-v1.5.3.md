status: done
agent: beta
task: Deploy v1.5.3 — settings FAB + note card UX
completed: 2026-03-31 — Commit 6796289 fatto, push su main completato, GitHub Actions deploy.yml build verde ✓

## Istruzioni
1. `git status` — verifica file modificati
2. `git add` di TUTTI i file modificati in `frontend/` (NON agents/)
3. Bump versione in `frontend/package.json`: 1.5.2 → 1.5.3
4. Commit:
```
feat: v1.5.3 — settings FAB + note card UX

- Feat: floating settings FAB bottom-left sidenav con speed dial M3 Expressive
- UX: logout spostato dentro il menu settings, rimosso dall'header
- UX: etichetta sezione "Fissate" con icona pin sopra le note pinnate
- UX: orario reminder mostrato nella note card se il reminder è oggi
- UX: swipe hint mobile — due dot di paginazione sotto la lista note
```
5. Push su main → workflow deploy.yml si attiva
6. Conferma build verde e FERMATI

## ⛔ Regole assolute
- NON includere file in `agents/` nel commit
- NON inviare notifiche push
- FERMATI dopo conferma build verde

## Note
- Deploy autorizzato da Giuseppe — 2026-03-31
