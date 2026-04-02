status: done
agent: beta
task: Rimuovi notifica automatica da deploy.yml
completed: Commit 3d64f7a pushato. 3 step rimossi da deploy.yml. Workflow completato (35s), build verde. Setup/Install/Notifica non più eseguiti ad ogni push.

## Problema
`deploy.yml` esegue `send-version-notification.js` ad ogni push su main — incondizionatamente.
Righe 47-62 da rimuovere:

```yaml
      - name: Setup Node.js for notifications
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: 'npm'
          cache-dependency-path: server/package-lock.json

      - name: Install server dependencies
        working-directory: ./server
        run: npm ci

      - name: Send version notification to users
        working-directory: ./server
        env:
          FIREBASE_SERVICE_ACCOUNT: ${{ secrets.FIREBASE_SERVICE_ACCOUNT }}
        run: node send-version-notification.js
```

## Fix
Rimuovi i 3 step sopra da `.github/workflows/deploy.yml`.
Il workflow `notify_version.yml` (manuale via workflow_dispatch) rimane intatto.

## Deploy
1. `git add .github/workflows/deploy.yml`
2. Commit: `fix: rimuovi notifica automatica da deploy.yml`
3. Push su main
4. Conferma build verde e FERMATI — ⛔ NON inviare notifiche
