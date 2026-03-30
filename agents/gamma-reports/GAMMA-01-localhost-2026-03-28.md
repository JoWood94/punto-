# Gamma Report #01-localhost — 2026-03-28

Riepilogo: **0 bug critici, 2 minori, 1 cosmetic/tecnico**
QA eseguito su: `https://localhost:4200` — 24/24 test Playwright passati ✅

---

## [GAMMA-001] Login background bianco invece di nero

- **Schermata:** Login
- **Gravità:** 🟡 Minore
- **Viewport:** tutti (375px, 390px, 1280px) — screenshot da `login.png`
- **Passi per riprodurre:**
  1. Navigare su `https://localhost:4200`
- **Comportamento attuale:** Sfondo bianco (#FFFBFE = `--punto-bg`). Logo "punto!" nero su bianco. Input outlined su bianco.
- **Comportamento atteso:** Design system → "Login: fullscreen sfondo nero, input outlined bianchi — ✅ INTENZIONALE". Sfondo dovrebbe essere `#1C1B1F`.
- **Screenshot:** `screenshots/qa01-localhost/login.png`

---

## [GAMMA-002] Speed dial FAB si espande verso il BASSO invece che verso l'alto

- **Schermata:** Dashboard — sidenav
- **Gravità:** 🟡 Minore
- **Viewport:** desktop-1280 (verificato da screenshot); mobile non verificabile (vedi GAMMA-003)
- **Passi per riprodurre:**
  1. Dashboard → sidenav aperta
  2. Click sul FAB settings (gear icon, bottom-left)
- **Comportamento attuale:** La voce "Esci" compare **sotto** il FAB (FAB a y≈295, "Esci" a y≈345). La speed dial si espande verso il basso.
- **Comportamento atteso:** "Click FAB → menu si espande verso l'alto" (dal task QA-01). La voce "Esci" dovrebbe comparire **sopra** il FAB.
- **Screenshot:** `screenshots/qa01-localhost/settings-fab-open.png`

---

## [GAMMA-003] Screenshot mobile sovrascritti dal run desktop — QA mobile non verificabile da immagini

- **Schermata:** Tutti (mobile-375, mobile-390)
- **Gravità:** 🔵 Tecnico/Cosmetic
- **Viewport:** 375px, 390px
- **Problema:** Il task playwright salva gli screenshot con nomi fissi senza prefisso viewport. Il run `desktop-1280` (eseguito per ultimo) sovrascrive quelli mobile. Tutti i file in `screenshots/qa01-localhost/` mostrano layout 1280px.
- **Comportamento atteso:** Screenshot separati per viewport per verificare: settings nell'header calendario mobile, assenza logout su mobile, sidenav mobile.
- **Impatto:** Non ho potuto verificare visivamente:
  - Icona settings top-right header in vista calendario mobile
  - Comportamento dropdown "Esci" su mobile calendario
  - Layout sidenav su mobile 375px/390px
- **Nota tecnica per Alpha:** Aggiungere `${viewport}-` come prefisso ai filename degli screenshot nello spec, oppure eseguire i 3 project in sequenza su directory separate.

---

## ✅ Sezioni confermate senza anomalie (da screenshot desktop-1280)

- **Settings FAB — presenza:** visibile bottom-left sidenav, sfondo nero (#1C1B1F), icona gear bianca ✅
- **Settings FAB — shape:** border-radius ~16px (shape-lg) ✅ corretto
- **Settings FAB — voce "Esci":** compare al click con icona logout corretta ✅
- **Header desktop — logout assente:** nessun bottone logout nell'header principale ✅
- **Calendario header — icona:** calendar_month icon top-right, nessun logout ✅
- **FAB "Nuova Nota":** presente bottom-right area principale, sfondo nero, icona edit bianca ✅
- **Search bar sidenav:** border-radius 16px (non pill) ✅
- **Logo "punto!":** filter brightness(0) — appare nero ✅ INTENZIONALE

---

## Riepilogo checklist QA-01

### Desktop (1280px)
- [x] FAB settings visibile bottom-left sidenav ✅
- [x] Logout NON presente nell'header desktop ✅
- [ ] Click FAB → menu si espande verso l'alto ❌ (si espande verso il basso — GAMMA-002)
- [ ] Icona FAB ruota quando menu aperto (non verificabile da screenshot statici)
- [x] Voce "Esci" presente con icona logout ✅

### Mobile 375px / 390px (non verificabile da screenshot — vedi GAMMA-003)
- [ ] FAB settings visibile bottom-left sidenav — test Playwright passato, non verificato visivamente
- [ ] Logout NON presente nel sidenav header mobile — test Playwright passato, non verificato visivamente

### Mobile — vista calendario
- [ ] Icona settings header top-right — non verificabile da screenshot (GAMMA-003)
- [ ] Click → dropdown verso il basso con "Esci" — non verificabile da screenshot (GAMMA-003)
- [ ] Logout NON è bottone separato — non verificabile da screenshot (GAMMA-003)

---

## Raccomandazione al Team Lead

1. **GAMMA-001** (login background): Verificare se è regressione CSS o cambio intenzionale non aggiornato nel design system. Se intenzionale, aggiornare `agents/context/gamma.md`.
2. **GAMMA-002** (speed dial direction): Fix CSS sulla speed dial — invertire l'ordine di espansione (flex-direction / bottom positioning). Non blocca il deploy ma va corretto.
3. **GAMMA-003** (screenshot mobile): Fix tecnico allo spec Playwright prima del prossimo run — aggiungere prefisso viewport ai filename.

**Esito complessivo:** ✅ QA passato (nessun critico). Deploy autorizzabile con fix GAMMA-002 pending.
