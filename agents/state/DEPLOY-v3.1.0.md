status: in_progress
agent: beta
task: Deploy v3.1.0 — deeplink notifiche fix

## Deploy autorizzato da Giuseppe

## File da includere nel commit
- `frontend/public/firebase-messaging-sw.js`
- `frontend/src/app/components/dashboard/dashboard.ts`
- `frontend/src/app/components/dashboard/dashboard.html`
- `frontend/package-lock.json`
- `agents/alpha/CLAUDE.md`
- `agents/inbox/alpha.md`
- `agents/inbox/beta.md`
- `agents/state/BF-51-deeplink-basepath-fix.md`
- `agents/state/BF-52-deeplink-nav-queue.md`
- `agents/state/BF-53-deeplink-no-flash.md`
- `agents/state/CFG-04-github-pages-fix.md`
- `agents/state/NOTIF-v3-body-fix.md`
- `agents/state/NOTIF-v3-trigger.md`
- `server/send-v3-notification.js`
- Questo file: `agents/state/DEPLOY-v3.1.0.md`

## NON includere
- `server/index.js` — ha modifica local-only ([LOCAL] prefix), NON committare

## Procedura
1. `git status` — verifica stato
2. Staggia esplicitamente i file elencati sopra (NON usare `git add -A`)
3. Commit con messaggio:
```
fix: v3.1.0 — deeplink notifiche da notifica push

- SW: base path corretto per GitHub Pages (/punto-/)
- SW: postMessage invece di client.navigate() (iOS affidabile)
- SW: navigation queue via Cache API (sopravvive a iOS deep sleep)
- Dashboard: checkNavigationQueue() in ngOnInit
- Dashboard: hasDeepLink flag elimina flash lista note
```
4. `git push`
5. Attendi build GitHub Actions verde
6. Aggiorna questo file con `status: done`
