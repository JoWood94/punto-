status: done
agent: alpha
task: Fix criteri validazione — secret crittografia senza requisiti, password account con requisiti

## Bug

I criteri di complessità (maiuscole, carattere speciale, numero, lunghezza minima) devono applicarsi SOLO alla password dell'account, NON alla secret di crittografia.

La secret di crittografia è una passphrase libera — l'utente può sceglierla senza vincoli.

## Fix

1. Rimuovere qualsiasi validazione di complessità dal campo secret crittografia (es. pattern validators, hint testuali sui requisiti)
2. Verificare che la password account abbia i criteri corretti (maiuscole, carattere speciale, numero, lunghezza minima)
3. Se i criteri sono condivisi tramite un validator comune, separarli in due validator distinti

## ⛔ NO deploy — attendo validazione Giuseppe in locale
completed: Rimosso blocking validation dalla passphrase dialog: (1) eliminata <ul class="requirements"> con checklist maiuscole/numero/speciale; (2) canConfirm non richiede più allMet — basta passphrase non vuota + conferma coincidente; (3) aggiunto hint "Scegli una passphrase memorabile — non ci sono vincoli di formato." La strength bar rimane come feedback opzionale (non bloccante). Password account: la login non aveva criteri UI espliciti — gestita da Firebase error messages (auth/weak-password). Nessun validator condiviso trovato tra i due campi.
bloccato_da:
