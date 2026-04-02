status: in_progress
agent: beta
task: Deploy v3.0.0 — GitHub Pages + Firebase Hosting

## Procedura

1. `cd /Users/giuseppebosco/Developer/punto`
2. `git status` — verifica tutti i file modificati
3. Bumpa versione in `frontend/package.json` da `2.0.3` → `3.0.0`
4. Staggia TUTTI i file modificati (`git add` selettivo su tutti i file nel working tree, NON solo agents/)
5. Commit con changelog completo (vedi sotto)
6. Push su `main` → attiva il workflow GitHub Pages (`deploy.yml`)
7. Deploy su Firebase Hosting: `cd frontend && npm run build && firebase deploy --only hosting`
8. Verifica build verde

## Commit message

```
feat: v3.0.0 — reminder completion, calendar scroll, editor polish

### Nuove funzionalità
- Promemoria: "Segna come evaso" con badge Evaso + undo (tap per annullare)
- Lista note: tab "Evasi" separato (appare solo se ci sono promemoria evasi)
- Calendario mobile: mesi scrollabili verticalmente con infinite scroll
- Swipe right per uscire dall'editor nota
- Time picker promemoria: due select Ora/Min a intervalli di 5 min (allineati al cron)
- Deep link notifiche push: apertura diretta della nota da notifica (fix iOS PWA)

### Fix & miglioramenti
- Header unificato fuori dal sidenav (navigazione fluida tra viste)
- Rimozione ripple/state layer dai bottoni header
- Calendar header mobile: toggle + Oggi / nav su due righe compatte
- Layout reminder: Data riga 1, [Ora:Min]+Ripeti riga 2 su mobile
- Font titolo nota (Plus Jakarta Sans esplicita su input)
- Salvataggio titolo su uscita senza blur
- Badge "Evaso" dark pill centrato, cliccabile su tutta la superficie
- "Segna come evaso" visibile anche senza modificare il reminder
- Blocco zoom PWA (user-scalable=no)
```

## Nota changelog per gli utenti (da inviare via notifica o inclusa nel corpo del commit)

**⚠️ Aggiornamento importante per chi usa punto! come PWA:**
Per ricevere il nuovo aggiornamento, **chiudi l'app dal selettore delle app** (scorri via la scheda) e riaprila. Il service worker si aggiornerà automaticamente.

## ⛔ Attendo conferma build verde prima di segnare done
completed:
bloccato_da:
