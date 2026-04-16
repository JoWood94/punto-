# val.town — infrastruttura notifiche punto!

Due val su val.town (stesso Project "notifyCompletion" o Project separati):

1. **`main.ts`** (HTTP trigger) — push **real-time** quando un utente evade un promemoria condiviso. Chiamato dal client fire-and-forget.
2. **`scheduledReminders.ts`** (Cron trigger, ogni 1 min) — sostituisce il cron GitHub Actions: controlla i promemoria scaduti, invia FCM, gestisce ricorrenze, ripulisce i flag di completion residui.

Il GHA cron (`.github/workflows/notify_cron.yml`) resta acceso come backup durante la fase di validazione. Quando i val sono stabili, può essere spento.

## Deploy — val HTTP (`notifyCompletion`)

1. **Login** su https://www.val.town con GitHub.
2. **Nuovo HTTP val** → nome suggerito: `notifyCompletion`.
3. Incolla il contenuto di `notifyCompletion.ts` (paste-and-save, il val tollera import `npm:`).
4. **Env vars** (Project Settings → Environment variables):
   - `FIREBASE_PROJECT_ID` = `punto-84646` (staging e prod condividono lo stesso Firebase project)
   - `FIREBASE_SERVICE_ACCOUNT` = JSON completo della service account (stesso `FIREBASE_SERVICE_ACCOUNT` usato da GHA; copialo da GitHub Secrets)
5. **Copia URL** pubblico del val (formato `https://<user>-notifycompletion.web.val.run`).
6. Incollalo nell'env Angular:
   - `frontend/src/environments/environment.ts` → `notifyUrl` (prod)
   - `frontend/src/environments/environment.development.ts` → `notifyUrl` (staging/dev)

## Verifica

Dopo deploy + env wire:

1. Da staging evadi un promemoria condiviso (guest o owner).
2. DevTools Network → deve comparire `POST https://<user>-notifycompletion.web.val.run` → 200.
3. Il destinatario riceve la push **entro 1-2s** (non più 5 min).
4. Se il val fallisce o URL non configurato, il cron GHA pulisce l'arretrato in ≤5 min.

## Logica

1. Client scrive i flag `completionNotifyPending/By/ByName/At` sul doc nota (già funzionante).
2. Client chiama il val fire-and-forget (non blocca UI) con Firebase ID token nell'header.
3. Val verifica token → legge nota → valida `caller == completionNotifyBy` → legge recipient users → FCM multicast localizzato per lingua → resetta flag via Firestore REST PATCH.

## Debug

- Logs: tab "Runs" sul val → click su ogni esecuzione.
- Se 401: token scaduto / progetto sbagliato.
- Se 403: caller non è il completatore (race o bug client).
- Se 404: noteId invalido (nota cancellata prima della chiamata).
- Se "GCP token exchange failed": `FIREBASE_SERVICE_ACCOUNT` malformato.

## Rollback

Cancella il val o rimuovi `notifyUrl` dagli environments → il client smette di chiamare → solo il cron GHA gestirà le evasioni (delay 5min).

---

## Deploy — val Scheduled (`scheduledReminders`)

Ricrea il lavoro del cron GHA sul lato val.town con granularità 1 minuto (contro i 5 del GHA).

1. Nel Project `notifyCompletion` (dove sta già `main.ts`): in sidebar click **"+"** → **New file** → nomalo `scheduled.ts` (o come preferisci).
2. Incolla il contenuto di `scheduledReminders.ts` di questo repo.
3. **Add trigger** (menu Code sul file) → **Cron** → espressione: `* * * * *` (ogni minuto).
4. Le env vars `FIREBASE_PROJECT_ID` e `FIREBASE_SERVICE_ACCOUNT` sono **già settate a livello Project** (condivise con `main.ts`) — nessuna azione extra richiesta.
5. Salva. Dalla tab **Runs** vedi le esecuzioni: ogni minuto deve loggare "scheduledReminders run" e "done in Xms".

## Verifica scheduled

Dopo deploy:

1. Nella web UI val.town, tab **Runs** → devi vedere un'esecuzione al minuto.
2. Crea un reminder a `t+2 min` su staging → dovrebbe arrivare push entro 60-90s (vs 5min del cron GHA).
3. Reminder ricorrente → dopo invio, controlla Firestore: `reminderTime` aggiornato al prossimo occorrenza, `reminderStatus` resta `pending`, `blocks[reminder].time` aggiornato.
4. Se il val logga errori, controllare: credenziali env, indici Firestore (query `reminderStatus` + collectionGroup `reminderSnoozes` devono avere index).

## Coesistenza val + GHA cron (transizione)

Durante la fase di validazione val.town e GHA sono entrambi attivi. Conflitto teorico: se scattano nello stesso istante su uno stesso reminder, il secondo a scrivere trova `reminderStatus='sent'` e non rifà nulla (idempotente). Possibile doppia push in caso di race → raro, tollerato.

Dopo 1-2 settimane di val stabile:
- Disabilita il workflow `notify_cron.yml` (commenta lo `schedule` o cambia il trigger a `workflow_dispatch`).
- Rimuovi `server/index.js` dal repo dopo aver verificato che non serve più.

## Rollback scheduled

Disabilita il trigger Cron del val (toggle su val.town) o rimuovi l'espressione → il GHA cron continua a gestire i reminder in autonomia (delay 5min).
