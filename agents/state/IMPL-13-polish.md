status: done
agent: alpha
task: Polish UI — swipe dots, empty states, delete button opacity mobile

## Contesto

Usa la skill `/polish` di Impeccable prima di implementare. Lascia che guidi le scelte.

## Punti da sistemare (da CRITIQUE.md)

### 1. Swipe dots navigazione mobile
- Attualmente: 6px, opacità 0.3 — quasi invisibili
- Obiettivo: dimensione e opacità leggermente maggiori per essere letti come affordance di navigazione

### 2. Empty state desktop
- Il placeholder "no selection" (icona sbiadita al 38% + h2 + button) è il pattern Material generico più comune
- Obiettivo: renderlo più caratteristico e coerente con la voce brand di punto!

### 3. Delete button opacity mobile
- Attualmente: su desktop opacity:0 (visibile solo su hover), su mobile opacity:0.45 sempre
- Comportamento inconsistente tra piattaforme
- Obiettivo: comportamento coerente — valuta la soluzione migliore dopo `/polish`

## ⛔ NO deploy — attendo validazione Giuseppe in locale
completed: (1) Swipe dots: 6px/0.3→7px/0.45 inattivi, 22px/0.8→24px/0.85 attivi. (2) No-selection state: rimossa mat-icon 38%+h2 generica, sostituita con logo a 15% opacity + copy conciso. (3) Delete btn: unificato a 0.55 opacity su entrambe le piattaforme (+ hover:1), era 0/hover-only desktop vs 0.45 mobile.
bloccato_da:
