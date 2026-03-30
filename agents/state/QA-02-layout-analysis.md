status: cancelled
agent: gamma
task: Analisi layout post UI-10 — verifica bug e regressioni
bloccato_da: Gamma eliminata (2026-03-30) — task non completato

## Contesto
Alpha ha implementato UI-10 (Settings FAB) + B-2 (fix CSS budget).
Il Team Lead ha segnalato che il layout potrebbe avere problemi visivi.
È stato trovato e fixato staticamente un bug: `top: 56px` → `top: 80px` nel dropdown calendario mobile.

## Cosa analizzare

### 1. Dropdown settings mobile calendario
- Il dropdown `.settings-menu-calendar` appare SOTTO l'header (non sovrapposto)?
- Il dropdown è allineato a destra e leggibile?

### 2. Settings FAB nella sidenav
- Il FAB settings è visibile bottom-left nella sidenav (non coperto dalla lista note)?
- Il padding-bottom della lista note (72px) lascia spazio sufficiente al FAB?
- Il menu speed-dial si apre verso l'alto correttamente?

### 3. Mobile sidenav header (vista lista)
- [calendario icon] [logo centrato] [spacer] — sembra bilanciato visivamente?
- Nessun bottone logout residuo nell'header?

### 4. Regressioni generali
- Layout nota card invariato (sfondo scuro, testo bianco)?
- FAB "Nuova Nota" non coperto dal settings FAB?
- Nessun overlap o z-index issue?

## Come fare QA
Dev server locale: `cd frontend && npm start` → https://localhost:4200
Usa DevTools → mobile iPhone SE 375px, iPhone 14 390px, desktop 1280px.

## Output
Aggiorna `agents/gamma-reports/INDEX.md` e crea `agents/gamma-reports/GAMMA-02-2026-03-28.md`.
Aggiorna questo file con `status: done` al termine.
