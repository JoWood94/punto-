status: done
agent: beta
task: In server/send-v3-notification.js, modifica il campo `body` della notifica webpush (riga ~68-69 e ~73) da:
  "Reminder evasi, calendario scroll, editor. Chiudi l'app per aggiornare."
a:
  "Nuova interfaccia, più funzionalità. Chiudi l'app dal selettore e riapri per aggiornare."
Aggiorna entrambe le occorrenze (notification.body e data.body).
Non committare, non pushare.
completed: Modificato server/send-v3-notification.js — entrambe le occorrenze del campo body aggiornate (righe 68 e 73)
bloccato_da:
