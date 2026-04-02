status: done
agent: alpha
task: Indicatore offline/errore sulla lista note

## Contesto

Le note si salvano su Firestore in real-time, ma non c'è alcun feedback visivo. Un utente con connessione lenta non sa se il contenuto è persistito. Particolarmente critico per i reminder.

## Skill da usare

Usa `/harden` per guidare l'implementazione.

## Cosa fare

1. Aggiungere un indicatore **sulla lista note** (non nell'editor) — visibile solo quando c'è un problema reale:
   - Stato offline (nessuna connessione)
   - Errore Firestore (write fallita)
2. Nessun indicatore quando tutto funziona normalmente — no "Salvata ✓" costante, solo segnale su errore/offline
3. Usare `navigator.onLine` + listener Firestore error per rilevare lo stato
4. Design: sottile — una chip o un'icona nell'header della lista, non un banner invasivo

## ⛔ NO deploy — attendo validazione Giuseppe in locale
completed: Aggiunto .connectivity-bar nella sidenav (sotto search bar, sopra lista) con role="status" aria-live="polite". Visibile solo se isOffline o hasFirestoreError. isOffline: navigator.onLine + window online/offline listeners (cleanup in ngOnDestroy). hasFirestoreError: catchato da notes$.subscribe error callback (era unhandled). Si azzera al ritorno online o alla prossima emissione valida del snapshot. Design: strip 5px padding, opacity 0.65, animazione fadeIn 200ms.
bloccato_da:
