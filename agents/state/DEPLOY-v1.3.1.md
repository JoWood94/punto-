status: done
agent: beta
task: Deploy v1.3.1 + notifica push utenti con changelog
completed: 2026-03-31T23:50:00Z

## Azioni completate
- [x] Bump versione 1.3.0 → 1.3.1 in frontend/package.json
- [x] Commit a6051c6 con changelog
- [x] Push su main — workflow deploy.yml attivo
- [x] Build verde: 36s, deploy su release_pages completato
- [x] Workflow send-notification.yml — notifiche FCM inviate a tutti gli utenti
- [x] Commit 3acbbeb: aggiunto workflow dispatch + script di notifiche

## Dettagli
**Deploy:** https://github.com/JoWood94/punto-/actions/runs/23773037073
**Notifiche:** https://github.com/JoWood94/punto-/actions/runs/23773095788
**Titolo:** punto! v1.3.1
**Body:** Fix notifiche, swipe mobile, promemoria ricorrenti e altri miglioramenti

## Azioni richieste

1. Bump versione in `frontend/package.json`: 1.3.0 → 1.3.1
2. Build + deploy su GitHub Pages (push su `release_pages` tramite workflow `deploy.yml`, oppure triggera manualmente il workflow)
3. Dopo deploy confermato verde: invia notifica push a tutti gli utenti con il changelog seguente

## Notifica push
**Titolo:** punto! v1.3.1
**Body:** Fix notifiche, swipe mobile, promemoria ricorrenti e altri miglioramenti

## Changelog completo (per il commit message)
- Fix: deep link notifiche push — tap apre la nota corretta
- Fix: layout promemoria desktop
- Fix: backspace titolo non naviga più indietro
- Fix: tap target pin/delete mobile più grandi
- Feat: promemoria ricorrenti (giornaliero/settimanale/mensile/annuale)
- Feat: swipe mobile lista ↔ calendario
- Feat: divisore visivo note fissate / normali

## Note
- Deploy autorizzato da Giuseppe (Team Lead) — 2026-03-31
- Usa TARGET_UID W42XL7UVYFRMakpZJdrpcGkgsQr1 per test notifica se necessario
- Non committare nulla su main senza build verde
