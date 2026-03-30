status: done
agent: gamma (eliminato 2026-03-30)
task: QA visuale — UI-10 Settings FAB + menu M3 Expressive

## Cosa verificare
Alpha ha implementato il settings FAB. Fai QA visuale su questi punti:

### Checklist desktop
- [ ] FAB settings visibile bottom-left della sidenav (non nell'header)
- [ ] Logout NON presente nell'header desktop
- [ ] Click FAB → menu si espande verso l'alto con animazione
- [ ] Icona FAB ruota quando menu aperto
- [ ] Voce "Esci" presente nel menu con icona logout
- [ ] Click fuori dal menu lo chiude
- [ ] Click "Esci" esegue logout

### Checklist mobile — lista note
- [ ] FAB settings visibile bottom-left sidenav
- [ ] Logout NON presente nel sidenav header mobile
- [ ] Menu funziona come desktop

### Checklist mobile — vista calendario
- [ ] Icona settings nell'header top-right (al posto del vecchio logout)
- [ ] Click → dropdown verso il basso con voce "Esci"
- [ ] Logout NON è un bottone separato nell'header

### Animazioni
- [ ] Speed dial: voci appaiono con slide-up + fade (200ms)
- [ ] Dropdown calendario: appare con fade + translateY (200ms)
- [ ] Icona settings → ruota 90deg quando aperta

## Come fare QA

### Fase 1 — localhost (OBBLIGATORIA prima del deploy)
Apri https://localhost:4200 nel browser.
Il dev server deve essere attivo (`cd frontend && npm start`).
Esegui tutta la checklist su localhost e riporta l'esito in agents/gamma-reports/GAMMA-01-localhost-$(date +%Y-%m-%d).md

Solo se la QA localhost è ✅ verde, il Team Lead autorizza il deploy.

### Fase 2 — produzione (dopo deploy autorizzato)
Apri https://giuseppebosco.github.io/punto-/ e ripeti la checklist.
Riporta l'esito in agents/gamma-reports/GAMMA-01-prod-$(date +%Y-%m-%d).md

Usa DevTools per simulare mobile (iPhone SE 375px, iPhone 14 390px) e desktop (1280px).

## Output
Crea agents/gamma-reports/GAMMA-01-$(date +%Y-%m-%d).md con il report.
Aggiorna agents/gamma-reports/INDEX.md.
Aggiorna questo file con status: done al termine.
