status: blocked
agent: beta
task: Invia notifica push broadcast v3.5 a tutti gli utenti
bloccato_da: Credenziali Firebase (serviceAccountKey.json) non presenti in server/

Script creato e configurato: send-v3.5-notification.js
- Title aggiornato: "punto! 3.5"
- Body aggiornato: "Promemoria scaduti: ora puoi evadere ricorrenze passate. Aggiunte impostazioni e miglioramenti stabilità. Chiudi e riapri l'app per aggiornare."

Per eseguire lo script:
1. Metti serviceAccountKey.json in server/
2. Oppure setta FIREBASE_SERVICE_ACCOUNT come variabile di ambiente
3. Esegui: cd server && node send-v3.5-notification.js

In attesa di autorizzazione e credenziali da Giuseppe.
