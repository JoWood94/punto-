status: done
agent: beta
task: Deploy v3.2.0 — fix notifiche doppie + pagina impostazioni
completed: Commit ec54a66 pushato. Deploy #124 success. Frontend + server su GitHub Pages + Firebase. Fix notifiche doppie: rimossa webpush.notification da server/index.js (solo webpush.data). FCM token cleanup con arrayUnion atomico. Settings page su /settings.

## File da committare
Frontend:
- `frontend/src/app/app.routes.ts`
- `frontend/src/app/components/dashboard/dashboard.html`
- `frontend/src/app/components/dashboard/dashboard.scss`
- `frontend/src/app/components/dashboard/dashboard.ts`
- `frontend/src/app/services/push-notification.ts`
- `frontend/src/styles.scss`
- `frontend/src/app/components/settings/` (directory intera — nuovo componente)

Server:
- `server/index.js` ← fix notifiche doppie (rimossa webpush.notification), VA committato

Agents:
- `agents/inbox/alpha.md`
- `agents/state/DEPLOY-v3.1.0.md`
- `agents/state/BF-55-fcm-token-cleanup.md`
- `agents/state/BF-55b-fcm-arrayunion-import.md`
- `agents/state/IMPL-21-settings-page.md`
- `agents/state/SESSION-2026-04-03-alpha-direct.md`
- Questo file: `agents/state/DEPLOY-v3.2.0.md`

## NON includere
- `run.log.gz`

## Messaggio di commit
```
fix: v3.2.0 — notifiche doppie + impostazioni

- Server: rimossa webpush.notification, solo webpush.data → fix notifiche doppie
- FCM: arrayUnion atomico + cleanup slice(-5) separato
- Settings: nuova pagina /settings con vista default e toggle titolo notifiche
- Dashboard: menu tre puntini dark, voce Impostazioni
- Header: CSS globale in styles.scss + --app-header-h in :root
```

## Procedura
1. `git status` — verifica
2. Staggia esplicitamente i file elencati (NON `git add -A`)
3. Commit con il messaggio sopra
4. `git push`
5. Attendi build GitHub Actions verde
6. Aggiorna questo file con `status: done`
