status: done
agent: alpha
task: Aggiungere validatori complessità password sulla registrazione

## Bug

La registrazione non ha criteri di complessità sulla password — solo Firebase auth/weak-password come fallback (errore generico post-submit). L'utente non sa in anticipo cosa è richiesto.

## Fix

Nel form di registrazione (`login.html` + `login.ts`), aggiungere validazione inline sulla password:

### Criteri richiesti
- Almeno 8 caratteri
- Almeno una lettera maiuscola
- Almeno un numero
- Almeno un carattere speciale (!@#$%^&* o simili)

### Implementazione
1. In `login.ts`: aggiungere getter `passwordRequirements` che valuta i 4 criteri (come nella passphrase-dialog, ma questi sono BLOCCANTI)
2. In `login.html`: mostrare i criteri **solo quando `isRegistering`** — una checklist inline sotto il campo password, con ogni criterio che diventa verde man mano che viene soddisfatto
3. Il submit deve essere disabilitato finché tutti i criteri non sono soddisfatti (in aggiunta alla verifica password === confirmPassword)
4. **NON** toccare il campo password del login (solo inserimento, nessun vincolo UI)
5. **NON** toccare la passphrase-dialog

## ⛔ NO deploy — attendo validazione Giuseppe in locale
completed: login.ts: getter passwordReq (4 criteri) + passwordAllMet; onSubmit guard aggiornato. login.html: checklist .password-requirements visibile solo se isRegistering && password.length > 0, ogni li diventa .met verde; submit [disabled] include isRegistering && !passwordAllMet. login.scss: stili .password-requirements. Login (non registrazione) non toccato.
bloccato_da:
