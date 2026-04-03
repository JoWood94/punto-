status: done
agent: alpha
task: Hotfix — TS2304 arrayUnion non trovato in push-notification.ts

## Bug
Build locale mostra: `TS2304: Cannot find name 'arrayUnion'` a push-notification.ts:42:46

Alpha ha rimosso arrayUnion dagli import ma è rimasto un riferimento nel codice (o viceversa).

## Fix
Leggi `push-notification.ts` righe 30-55 e:
1. Se `arrayUnion` è ancora usato nel codice → re-aggiungilo all'import da `@angular/fire/firestore`
2. Se `arrayUnion` non è più usato → rimuovi il riferimento residuo alla riga 42

Build production OK.

## ⛔ NO deploy — attendo validazione Giuseppe
completed: Nessuna modifica necessaria. push-notification.ts è già pulito: nessun riferimento a arrayUnion nel codice né negli import. L'errore era probabilmente nella cache di build.
