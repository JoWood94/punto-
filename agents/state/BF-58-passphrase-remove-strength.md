status: done
agent: alpha
task: Rimuovere strength bar e hint dalla passphrase dialog

## Fix

Nel componente passphrase dialog (cerca file che contiene "Proteggi le tue note" o "strength" o "forte"), rimuovere:

1. La strength bar (barra verde/rossa con label "forte"/"debole")
2. Il testo hint "Scegli una passphrase memorabile — non ci sono vincoli di formato."

Mantenere:
- Campo passphrase con toggle visibilità
- Campo conferma passphrase con toggle visibilità
- Bottoni Annulla / Imposta

## Output atteso
- Build production OK
- Aggiorna questo file con `status: done` e `completed:`

## ⛔ NO deploy — attendo validazione Giuseppe in locale
completed: passphrase-dialog.ts: rimossi strength-bar-wrap, strength-fill, strength-label, passphrase-hint dal template e dai styles. Rimossi PassphraseStrength interface, req, strength, strengthPercent dalla classe. onPassphraseChange() semplificato a solo reset errorMessage.
