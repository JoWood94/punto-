status: done
agent: alpha
task: Fix toolbar — puntino sotto icona calendario + menu impostazioni si apre da solo

## Bug 1 — Puntino sotto l'icona calendario

L'icona `calendar_today` in `dashboard.html` mostra un puntino/dot sotto la griglia del calendario.
È la design dell'icona Material `calendar_today` che include un "today indicator" visivamente rumoroso.

Fix: sostituire `calendar_today` con `calendar_month` in tutti i punti del template dove appare
(sia mobile che desktop, sia nella toolbar che eventuali altri posti).

Verificare in `dashboard.html` tutte le occorrenze di `calendar_today` e sostituirle con `calendar_month`.

## Bug 2 — Menu impostazioni si apre da solo su alcuni eventi di navigazione

Su certi eventi (es. tornare al dashboard dall'editor, cambio vista) il menu `settingsMenu`
si apre automaticamente senza che l'utente lo tocchi.

Causa probabile: quando `activeNote` diventa `undefined`, il bottone `*ngIf="activeNote === undefined"`
riappare nel DOM. Angular Material può ripristinare il focus su questo bottone, e un evento
touch/click residuo in bubble lo triggera.

Fix: aggiungere `(menuOpened)` guard oppure usare `stopPropagation` sul click del bottone,
oppure — più semplice — aggiungere un piccolo delay alla comparsa del bottone per evitare
che assorba eventi residui.

Approccio consigliato in `dashboard.ts`: introdurre un flag `settingsMenuEnabled = false`
che viene impostato a `true` dopo un breve delay (100ms) quando `activeNote` torna `undefined`.
In template: `*ngIf="activeNote === undefined" [disabled]="!settingsMenuEnabled"`.

In alternativa: verificare se il problema è legato al `[overlapTrigger]="false"` aggiunto da BF-67
che potrebbe causare side effects di focus — rimuoverlo se non necessario.

Investigare la causa precisa prima di applicare il fix.

## Output atteso
- Fix in `dashboard.html` e/o `dashboard.ts`
- Build production OK
- Aggiorna questo file con `status: done` e `completed:`

## ⛔ NO deploy — attendo validazione Giuseppe in locale
completed: Bug1: dashboard.html — tutte le occorrenze di calendar_today → calendar_month (2 punti: mobile e desktop). Bug2: dashboard.ts — aggiunto settingsMenuEnabled=true + settingsMenuTimer; closeEditor() e handleBackButton() ora chiamano deactivateNote() che imposta enabled=false + setTimeout 150ms → true; cleanup in ngOnDestroy. dashboard.html: bottone menu con [disabled]="!settingsMenuEnabled"; rimosso [overlapTrigger]="false" (BF-67, potenziale causa side-effect di focus). Build OK.
