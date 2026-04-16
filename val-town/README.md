# val.town — notifyCompletion

Proxy serverless per push notification real-time quando un collaboratore evade un promemoria condiviso. Complementa (non sostituisce) il cron GitHub Actions che resta come fallback.

## Deploy

1. **Login** su https://www.val.town con GitHub.
2. **Nuovo HTTP val** → nome suggerito: `notifyCompletion`.
3. Incolla il contenuto di `notifyCompletion.ts` (paste-and-save, il val tollera import `npm:`).
4. **Env vars** (icona chiave inglese sul val):
   - `FIREBASE_PROJECT_ID` = `punto-staging` (per ora solo staging)
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
