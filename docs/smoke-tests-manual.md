# Smoke test manuali — shared-calendars

Test da eseguire manualmente da Giuseppe a staging post-deploy di ogni fase.
Segna **PASS/FAIL** + note. In caso di FAIL, ferma progressione fase.

Legenda:
- `🅓` = desktop Chrome
- `🅘` = iPhone Safari (real device o simulator)
- `🅕` = Firestore Console verifica

---

## Fase 0 — Schema tipizzato + rules strict

| ID | Dove | Azione | Atteso | ✅/❌ |
|----|------|--------|--------|------|
| 0.1 | 🅓 staging | Login + lista note carica | Dashboard mostra note esistenti, nessun errore console | |
| 0.2 | 🅕 | Apri doc note legacy (pre-migrazione) | Si legge, apre editor senza crash | |
| 0.3 | 🅓 | Crea nuova nota vuota → salva | Firestore: `type:'note'`, `hasReminderBlock:false` | |
| 0.4 | 🅓 | Crea nota con reminder block → salva | Firestore: `type:'memo'`, `hasReminderBlock:true` | |
| 0.5 | 🅓 | Modifica titolo nota esistente | Save OK, no errori rules | |
| 0.6 | 🅕 Console | Prova creare doc senza `type` manualmente | Permission denied | |
| 0.7 | 🅕 Console | Prova creare doc `type:'note'` + `hasReminderBlock:true` | Permission denied | |
| 0.8 | 🅘 | Dashboard + crea nota + crea memo | Tutto OK, viewport ok | |

---

## Fase 1 — Muro nota/memo + FAB speed-dial

| ID | Dove | Azione | Atteso | ✅/❌ |
|----|------|--------|--------|------|
| 1.1 | 🅓 | Tab nav | Etichette: **Note · Promemoria · Calendario** | |
| 1.2 | 🅓 | FAB `+` tap | Menu speed-dial con 3 voci (Nota, Memo, Evento) | |
| 1.3 | 🅓 | FAB → Nota → editor | Nessun picker reminder, nessun calendario | |
| 1.4 | 🅓 | In una nota esistente prova aggiungere ReminderBlock | UI non lo permette | |
| 1.5 | 🅓 | FAB → Memo → save senza data | Bloccato con messaggio validazione | |
| 1.6 | 🅓 | FAB → Memo → data impostata → save | Salva come `type:'memo'`, va nel tab Promemoria | |
| 1.7 | 🅓 | FAB → Evento con 0 calendari | Auto-crea calendario "Personale" silenzioso + apre editor evento | |
| 1.8 | 🅓 | Azione "Duplica come memo" su una nota | Nuovo doc type:'memo', originale intatto | |
| 1.9 | 🅓 | Azione "Duplica come evento" | Nuovo doc type:'event' con picker calendario | |
| 1.10 | 🅘 | Stesso di 1.2-1.3 su iOS Safari | FAB menu usabile, editor responsive | |

---

## Fase 2 — Immagine singola inline

| ID | Dove | Azione | Atteso | ✅/❌ |
|----|------|--------|--------|------|
| 2.1 | 🅓 | Editor nota → "Aggiungi immagine" → jpg 5MB | Compressa <200KB, preview 120x120 | |
| 2.2 | 🅘 | Stesso con foto HEIC iPhone | Convertita a JPEG, preview mostrata | |
| 2.3 | 🅓 | Upload PNG 10MB | Compressione o rifiuto se >200KB post | |
| 2.4 | 🅓 | Rimuovi immagine (X overlay) | Campo `image` rimosso dal doc Firestore | |
| 2.5 | 🅓 | Card list nota con immagine | Thumbnail inline ~120px, object-fit cover | |
| 2.6 | 🅓 | Evento con immagine in calendar view | Popup/tooltip mostra immagine, badge icona | |
| 2.7 | 🅕 | Doc con immagine in Firestore | `image:{data:base64,mimeType}`, size < 300KB chars | |

---

## Fase 3 — Entity Calendar + feed subscribe

| ID | Dove | Azione | Atteso | ✅/❌ |
|----|------|--------|--------|------|
| 3.1 | 🅓 | Crea calendario "Test" via UI | Doc in `calendars/{id}` con owner uid | |
| 3.2 | 🅓 | Genera invite link calendario | `invites/{token}` con `type:'calendar'`, scadenza 30gg | |
| 3.3 | 🅓 acct 2 | Apri link calendar-invite → conferma | Subdoc `subscribers/{uid2}` creato | |
| 3.4 | 🅓 acct 1 (owner) | Tenta vedere lista subscribers | **NON deve esistere UI che la mostra** | |
| 3.5 | 🅓 acct 2 | Unsubscribe dal calendario | Subdoc eliminato, calendario via dalla lista | |
| 3.6 | 🅓 owner | Elimina calendario con 3 eventi | Dialog conferma count, cascade delete | |
| 3.7 | 🅓 acct 2 | Update evento owned da altro owner | Rejected (read-only) | |
| 3.8 | 🅓 owner | Rigenera invite → link precedente | Link vecchio non funziona, iscritti restano | |

---

## Fase 4 — Eventi UI

| ID | Dove | Azione | Atteso | ✅/❌ |
|----|------|--------|--------|------|
| 4.1 | 🅓 | FAB → Evento → calendario A → save | Doc `type:'event'`, `calendarId:A` | |
| 4.2 | 🅓 | Action "Sposta in calendario" → B (owned) | `calendarId:B` aggiornato | |
| 4.3 | 🅓 | Sposta verso calendario subscribed | UI non espone opzione | |
| 4.4 | 🅓 | Apri evento di calendario subscribed | Editor read-only, banner "Sola lettura" | |
| 4.5 | 🅓 | Cancel evento (toggle) | `cancelled:true`, strikethrough in vista calendario | |
| 4.6 | 🅓 | Evento cancelled → pass reminder time | Nessuna push inviata | |
| 4.7 | 🅓 | Calendar view | Evento proprio = dot colore, subscribed = dot+badge persone | |
| 4.8 | 🅘 | Creazione evento completa | Responsive, picker ok | |

---

## Fase 5 — Vista calendario + modale

| ID | Dove | Azione | Atteso | ✅/❌ |
|----|------|--------|--------|------|
| 5.1 | 🅓 | Tab Calendario → icona filtri | Modale filter si apre | |
| 5.2 | 🅓 | Toggle "Mostra memo" off | Vista mese mostra solo eventi | |
| 5.3 | 🅓 | Checkbox calendario subscribed off | Eventi di quel calendar scompaiono | |
| 5.4 | 🅓 | Personale checkbox | Disabilitato + tooltip, non disattivabile | |
| 5.5 | 🅓 | CTA "Aggiungi calendario" → paste link | Modale conferma → subscribe | |
| 5.6 | 🅓 | Paste link invalido | Errore UI specifico | |
| 5.7 | 🅓 | Icona ⋯ su calendario iscritto | Toggle notifiche + unsubscribe | |
| 5.8 | 🅓 | Refresh pagina | Stato toggle/filter ripristinato (persistenza) | |
| 5.9 | 🅓 | Share action su evento | Toast "condividi il calendario X", no share singolo | |
| 5.10 | 🅓 | Calendar-manage (⚙ owned) | Rinomina, color picker 8 colori M3, elimina | |

---

## Fase 6 — Notifiche push eventi

| ID | Dove | Azione | Atteso | ✅/❌ |
|----|------|--------|--------|------|
| 6.1 | 🅓 owner | Crea evento tra 1 min | Ricevi push entro ~60s | |
| 6.2 | 🅓 subscriber OFF | Attendi reminder time | Nessuna push | |
| 6.3 | 🅓 subscriber ON | Attendi reminder time | Push arrivata | |
| 6.4 | 🅓 | Evento cancelled prima del reminder | Nessuna push | |
| 6.5 | 🅓 multi-device owner | Reminder evento | Push su tutti i device attivi | |
| 6.6 | 🅓 owner | Toggle notifiche OFF per proprio calendario | No push per propri eventi | |
| 6.7 | 🅓 | Sub che riceve 3 calendari con evento stessa ora | 3 push distinte (dedup non implementata — atteso) | |

---

## Post-release — integrity check (Task #9)

| ID | Check | Atteso | ✅/❌ |
|----|-------|--------|------|
| R.1 | Count `notes` pre-migrazione vs post | Identico | |
| R.2 | Count `users` pre-migrazione vs post | Identico | |
| R.3 | Spot-check 20 doc random id-based | Campi originali invariati (uid, title, blocks, color, createdAt) | |
| R.4 | Console errori client su staging+prod per 24h | 0 errori type-related | |
| R.5 | Push delivery lag | <60s | |
| R.6 | Tempo creazione evento dal FAB | <3 tap | |
| R.7 | Subscribe a calendar via link | <5 secondi | |

---

**Note**:
- Ogni FAIL → ferma progressione fase, notifica team-lead.
- Test 🅘 iOS Safari sono critici (mobile-first). Non skippare.
- 🅕 = Firestore Console web per verifiche schema/rules.
