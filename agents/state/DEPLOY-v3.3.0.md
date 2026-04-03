status: in_progress
agent: beta
task: Deploy v3.3.0 — deeplink polish + impostazioni reset encryption

## Deploy autorizzato da Giuseppe

## File da committare
Frontend:
- `frontend/src/app/components/dashboard/dashboard.html`
- `frontend/src/app/components/dashboard/dashboard.ts`
- `frontend/src/app/components/settings/settings.component.html`
- `frontend/src/app/components/settings/settings.component.scss`
- `frontend/src/app/components/settings/settings.component.ts`

Agents:
- `agents/inbox/alpha.md`
- `agents/inbox/beta.md`
- `agents/state/BF-56-deeplink-hasdeeplink-default.md`
- `agents/state/BF-57-dashboard-isready.md`
- `agents/state/IMPL-22-reset-encryption.md`
- `agents/state/IMPL-23-recurring-reminders-review.md`
- Questo file: `agents/state/DEPLOY-v3.3.0.md`

## NON includere
- `run.log.gz`

## Messaggio di commit
```
feat: v3.3.0 — deeplink senza flash + impostazioni complete

- Dashboard: isReady flag — zero flash su apertura normale e da notifica
- Dashboard: hasDeepLink → isReady (init completo prima del render)
- Settings: reset chiave cifratura con cancellazione note e ripristino stato
- Settings: danger zone con conferma modale
```

## Procedura
1. `git status` — verifica
2. Staggia esplicitamente i file elencati (NON `git add -A`)
3. Commit con messaggio sopra
4. `git push`
5. Attendi build GitHub Actions verde
6. Aggiorna questo file con `status: done`
