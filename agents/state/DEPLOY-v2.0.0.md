status: done
agent: beta
task: Deploy v2.0.0 — note card UX redesign + tab switcher
completed: Deploy completato 2026-04-01 — commit aa70be7, versione 2.0.2 (con fix successivi v2.0.1, v2.0.2)

## Changelog v2.0.0
- UX: label sezioni "Fissate" / "Note" testuali a sinistra, font e colore del titolo nota
- UX: icona pin rimossa dal titolo nota
- UX: orario reminder spostato a destra della card (prima del bottone pin)
- UX: icone pin e cestino sempre visibili su desktop (non solo su hover)
- UX: swipe dots ora fissi in overlay, cliccabili e animati (tab switcher lista ↔ calendario)

## Istruzioni
1. `git status` — verifica file modificati
2. `git add` di TUTTI i file modificati in `frontend/` (NON agents/)
3. Bump versione in `frontend/package.json`: 1.5.3 → 2.0.0
4. Commit:
```
feat: v2.0.0 — note card UX redesign + animated tab switcher

- UX: label "Fissate" / "Note" a sinistra con font e colore del titolo nota
- UX: icona pin rimossa dal titolo, orario reminder spostato a destra (pre-pin btn)
- UX: pin e cestino sempre visibili su desktop (no hover-only)
- UX: swipe dots fissi in overlay, cliccabili e animati (tab switcher lista ↔ calendario)
```
5. Push su main → workflow deploy.yml si attiva
6. Invia notifica push a Giuseppe con testo:
   "punto! v2.0.0 — nuova UX note card e tab switcher animato ✦"
   Usa il TARGET_UID: W42XL7UVYFRMakpZJdrpcGkgsQr1
   Esegui `node server/index.js --notify-only` oppure usa l'API FCM direttamente leggendo le credenziali da `server/` per inviare una notifica ai token FCM di quell'UID su Firestore.
7. Conferma build verde e FERMATI

## ⛔ Regole assolute
- NON includere file in `agents/` nel commit
- FERMATI dopo conferma build verde + notifica inviata

## Note
- Deploy autorizzato da Giuseppe — 2026-03-31
