# Calendari Condivisi + Tipizzazione Note/Memo/Evento — Implementation Plan

## Context
Oggi `punto!` ha una sola entity (`Note` con `blocks[]`). Le note "mutano" in promemoria quando aggiungi un `ReminderBlock` e cambiano lista di conseguenza — comportamento confusionario per l'utente. Vogliamo:
1. Separare nettamente **Note**, **Memo** ed **Eventi** come tipi esclusivi (niente conversione in-place).
2. Introdurre **Calendari** come aggregatori di eventi, condivisibili via link con modello "feed" (subscribe self-service, nessuna lista sottoscritti lato owner).
3. Aggiungere **una sola immagine** per documento, salvata inline in base64 (niente Firebase Storage — resta su Spark).
4. Unificare la creazione dietro un **FAB `+` speed-dial** che apre un menu Nota / Memo / Evento.

**Principio guida**: una sola collection `notes` con discriminator `type`. Nessuna terza collection. Sharing calendari ≠ sharing note: i due modelli restano distinti.

---

## Decisioni architetturali (riferimento)

| Tema | Decisione |
|------|-----------|
| Entità fisica | Una sola: `notes/{id}` con `type: 'note' \| 'memo' \| 'event'` |
| Conversione tra tipi | Vietata. Unico escape-hatch: azione menù "Duplica come memo/evento" |
| Reminder su `note` | Vietato (validazione client + rules) |
| `calendarId` su `memo` / `note` | Vietato |
| `calendarId` su `event` | Obbligatorio |
| `completed` | Solo su `memo`. Evento usa `cancelled` (flag separato) |
| Immagine | Campo `image?: { data, mimeType }`, base64 max ~200KB dopo compressione 1024px/JPEG 0.7 |
| Sharing note | Resta come oggi (`collaborators` + permessi granulari). E2E p2p = backlog |
| Sharing calendari | Modello feed: link pubblico → subscriber self-service. Owner non vede lista. Sempre in chiaro |
| Ruoli calendario | MVP: `owner` + `subscriber`. Fase 2: `editor` (invito mirato) — fuori scope ora |
| Più calendari/utente | Sì, N calendari per utente. Evento spostabile tra calendari **stessi owner** |
| Notifiche evento | Opt-in per-calendario nel doc subscriber |
| Calendario personale | Implicito e sempre selezionato in vista calendario. Non cancellabile |
| FAB creazione | Speed-dial M3 unico con 3 voci (Nota / Memo / Evento) |
| Migrazione | Note con `ReminderBlock` → `type='memo'`; le altre → `type='note'`. Script idempotente |

---

## Fase 0 — Schema, rules, migrazione (no UI)

Obiettivo: il sistema legge/scrive `type` senza cambiare comportamento utente. Deploy silenzioso.

### Firestore Schema
- **Campo nuovo su `notes/{id}`**:
  - `type: 'note' | 'memo' | 'event'`
  - `cancelled?: boolean` (solo event, default false)
  - `calendarId?: string` (solo event, required se type==='event')
  - `image?: { data: string; mimeType: 'image/jpeg' | 'image/png' | 'image/webp' }` (opzionale, ogni tipo)

### File da modificare
| File | Modifica |
|------|----------|
| `frontend/src/app/services/note.ts` — **Interface `Note`** | Aggiungere `type: NoteType` (union), `cancelled?`, `calendarId?`, `image?`. Esportare type alias `NoteType` |
| `frontend/src/app/services/note.ts` — **`createNote()`** | Default `type='note'` se non specificato (back-compat). Validazione: se `type='note'` rimuovi ReminderBlock dai blocks. Se `type='event'`, richiedi `calendarId` |
| `frontend/src/app/services/note.ts` — **Helpers** | Nuovi: `isNoteType(n)`, `isMemoType(n)`, `isEventType(n)`. Deprecare uso di `hasReminder()` come discriminator di vista (tenerlo per retrocompatibilità nei rendering legacy) |
| `firestore.rules` | Regola scrittura: `type` ∈ {'note','memo','event'}. Se `type='event'` → `calendarId` required. Se `type='note'` → `blocks` non deve contenere reminder. Immagine: size max ~300KB stringa base64, mimeType in whitelist |
| `firestore.indexes.json` | Se serve: index `(uid, type)` per query filtrate, `(calendarId, reminderTime)` per vista calendario |
| **Nuovo** `server/scripts/migrate-notes-to-typed.js` | Script Node: legge tutte le note, se ha `ReminderBlock` → set `type='memo'`, altrimenti `type='note'`. **Idempotente** (salta quelle già tipizzate). Dry-run flag `--dry-run`. Backup pre-run via script esistente `backup-rf01b.js` pattern |

### Ordine esecuzione Fase 0
1. Backup DB (`server/scripts/backup-rf01b.js` pattern → riuso per notes)
2. Deploy rules aggiornate **che accettano sia doc con `type` sia senza** (soft migration)
3. Deploy frontend che scrive sempre `type` ma legge graceful (default `'note'` se mancante)
4. Run script migrazione dry-run → verifica conteggi
5. Run script migrazione live
6. Deploy rules **stringenti** (ora `type` è required)

### Rischi
- Race condition se utente scrive durante migrazione → script deve usare transazione per doc
- Campo `type` mancante su doc offline creati pre-deploy → lettura sempre graceful

### Testing Fase 0
- Unit test: migrazione idempotente (run 2x stesso risultato)
- Unit test: `createNote` rispetta vincoli per tipo
- Manuale: crea nota senza reminder, verifica `type='note'` in Firestore console

---

## Fase 1 — Muro netto Note ↔ Memo (UX)

Obiettivo: separare le due viste, eliminare conversione implicita, introdurre FAB speed-dial.

### File da modificare
| File | Modifica |
|------|----------|
| `frontend/src/app/components/dashboard/dashboard.ts` | **Rimuovi** filtro basato su `hasReminder(n)`. Sostituisci con filtro basato su `n.type`:<br>- `get noteList` → `filteredNotes.filter(n => n.type === 'note')`<br>- `get memoList` → `filteredNotes.filter(n => n.type === 'memo')`<br>- `activeView: 'notes' \| 'memos' \| 'calendar'` (rinomina `reminders` → `memos`) |
| `frontend/src/app/components/dashboard/dashboard.html` | Rinomina etichette tab: "Reminders" → "Memo". Il tab Calendario resta |
| `frontend/src/app/components/dashboard/dashboard.html` + `.scss` | Sostituire FAB "New Note" singolo con componente `<app-create-fab>` che espone menù M3 a 3 voci |
| **Nuovo** `frontend/src/app/components/create-fab/create-fab.component.ts + .html + .scss` | Componente riutilizzabile: FAB `+` principale → al tap apre speed-dial con 3 mini-FAB (Nota / Memo / Evento). Material 3 FAB menu pattern. Emette `(create)="$event: 'note' \| 'memo' \| 'event'"`. Se utente ha 1 solo calendario, "Evento" apre direttamente editor con `calendarId` pre-valorizzato; se 0 calendari, "Evento" mostra CTA "Crea un calendario prima"; se >1 calendari, picker calendario inline |
| `frontend/src/app/components/note-editor/note-editor.ts + .html` | Il componente riceve `@Input() noteType: NoteType`. In base a `noteType`:<br>- `note`: nessun picker reminder, nessun picker calendario<br>- `memo`: picker reminder obbligatorio (validazione al save), nessun calendario<br>- `event`: picker reminder obbligatorio + picker calendario (read-only se editing evento esistente con `calendarId` fisso, spostabile via azione dedicata) |
| `frontend/src/app/components/note-editor/note-editor.ts` | Nuova action menù **"Duplica come memo"** (visibile se `noteType='note'`) e **"Duplica come evento"** (visibile se `noteType='note' \| 'memo'`). Crea nuovo doc copiando `blocks`, `image`, `color` ma con `type` diverso + prompt per data/ora (memo/event) + picker calendario (event) |
| `frontend/src/app/components/note-editor/note-editor.ts` | Guard `canSave`: se `noteType='memo'` o `'event'` → verifica che `blocks` contenga ReminderBlock con `time` valorizzato |
| `frontend/src/app/services/note.ts` — **`createNote()`** | Accetta `type` obbligatorio in input. Errore esplicito se schema non coerente |
| `frontend/src/app/services/note.ts` — **`updateNote()`** | Guard: rifiuta payload che cambierebbe `type` (immutabile post-creazione). Duplica = nuovo doc, mai update |
| `frontend/src/app/app.routes.ts` o router dashboard | Passare `type` via route param o state quando si apre editor per nuova entity |
| `frontend/src/assets/i18n/it.json` | Chiavi: `ENTITY.NOTE`, `ENTITY.MEMO`, `ENTITY.EVENT`, `ACTION.DUPLICATE_AS_MEMO`, `ACTION.DUPLICATE_AS_EVENT`, `FAB.CREATE`, `FAB.NEW_NOTE`, `FAB.NEW_MEMO`, `FAB.NEW_EVENT` |

### Rimozioni
- In `dashboard.ts` logica `viewAutoSelected` basata su presenza reminder → ora la vista è scelta manuale o default `notes`
- Rimuovere dal template editor la possibilità di aggiungere `ReminderBlock` a un doc `type='note'`

### Testing Fase 1
- E2E: creo nota → aggiungo reminder da editor (non deve essere possibile)
- E2E: creo memo senza data → save bloccato con messaggio
- E2E: duplica nota come memo → nuovo doc, nota originale invariata
- E2E: FAB menu apre 3 opzioni, tap su "Evento" con 0 calendari mostra CTA

---

## Fase 2 — Immagine singola (base64 inline)

Obiettivo: aggiungere campo `image` a note/memo/evento. Usabile anche come locandina evento.

### File da modificare
| File | Modifica |
|------|----------|
| **Nuovo** `frontend/src/app/services/image-processor.service.ts` | Service: `compressImage(file: File): Promise<{ data: string; mimeType: string; sizeKB: number }>`. Usa `<canvas>`: resize a max 1024px lato lungo, output JPEG qualità 0.7. Reject se `sizeKB > 200`. Accetta input: jpg/png/webp/heic (heic → converti a jpeg) |
| `frontend/src/app/services/note.ts` — **Interface** | `image?: { data: string; mimeType: string }` già aggiunto in Fase 0 |
| **Nuovo** `frontend/src/app/components/image-picker/image-picker.component.ts + .html + .scss` | Componente standalone: button "Aggiungi immagine" con `<input type="file" accept="image/*">`. On select → `ImageProcessor.compressImage()` → emette output. Preview quadrata 120x120 con overlay X per rimuovere. Stati: empty / uploading / error / loaded |
| `frontend/src/app/components/note-editor/note-editor.html` | Integrare `<app-image-picker>` sopra o sotto il titolo. Se documento è `type='event'`, placeholder "Aggiungi locandina" |
| `frontend/src/app/components/note-editor/note-editor.ts` | Handler `onImageChange(image)`: aggiorna `currentNote.image`, trigger save |
| **Card list** (dashboard list di note/memo) | Se `note.image` presente → renderizza thumbnail inline (height ~120px con `object-fit: cover`). Priorità visiva: immagine > titolo > preview testo |
| **Calendar view** | Evento con `image` → quando cliccato in vista mese, tooltip/popup mostra immagine a lato. Eventualmente badge icona "🖼" (solo se emoji già accettate — altrimenti icona SVG Material) |
| `firestore.rules` | Validazione: se `image` presente, `image.data.size() < 300000` (chars base64), `image.mimeType in ['image/jpeg','image/png','image/webp']` |
| `frontend/src/assets/i18n/it.json` | `IMAGE.ADD`, `IMAGE.REMOVE`, `IMAGE.TOO_LARGE`, `IMAGE.UNSUPPORTED_FORMAT`, `IMAGE.PROCESSING` |

### Rischi e mitigazioni
- **Document size**: Firestore max 1MB/doc. Con immagine 200KB + blocks + metadata resti sotto. Validare con test reali
- **Payload listener**: `getNotes()` scarica tutte le immagini inline → listato di 50 note = ~10MB di transfer. Mitigazione futura (backlog): subcollection `notes/{id}/media/cover` letta on-demand. Per MVP accetta il costo
- **Offline cache**: persistentLocalCache contiene anche le immagini → disk usage utente. Accettabile

### Testing Fase 2
- Upload immagine 5MB originale → compressa correttamente sotto 200KB
- Upload HEIC da iPhone → convertito a JPEG
- Upload file >200KB post-compressione → errore UI
- Cancella immagine → campo `image` rimosso dal doc

---

## Fase 3 — Entity `Calendar` + sottoscrizione feed

Obiettivo: creare entità calendario con sharing modello "feed". Ancora nessuna UI eventi — quella in Fase 4.

### Firestore Schema
- **Nuova collection `calendars/{calId}`**:
  ```
  {
    uid: string,              // owner
    title: string,
    color: string,            // hex/theme token, default #1C1B1F
    description?: string,
    createdAt: number,
    updatedAt: number
  }
  ```
- **Subcollection `calendars/{calId}/subscribers/{uid}`** (il sub scrive se stesso):
  ```
  {
    uid: string,
    joinedAt: number,
    notificationsEnabled: boolean,  // opt-in, default false
    role: 'owner' | 'subscriber'     // owner auto-iscritto a se stesso
  }
  ```
- **Collection esistente `invites/{token}`** → estendere: aggiungere `calendarId?: string` alternativo a `noteId?`. Esattamente uno dei due valorizzato. `type: 'note' | 'calendar'`

### File da modificare
| File | Modifica |
|------|----------|
| **Nuovo** `frontend/src/app/services/calendar.ts` | Nuovo `CalendarService`: `createCalendar(data)`, `updateCalendar(id, data)`, `deleteCalendar(id)` (cascade events), `getMyCalendars()` (owned), `getSubscribedCalendars()` (feed), `getCalendar(id)`, `subscribeToCalendar(token)` (consuma invite), `unsubscribeFromCalendar(calId)` (self), `toggleCalendarNotifications(calId, enabled)`, `createCalendarInvite(calId)`, `readCalendarInvite(token)` |
| **Calendario personale implicito** | Al primo login o primo tentativo di creare evento: se l'utente non ha calendari, `CalendarService` crea auto `{title: 'Personale', color: default}` e lo restituisce. Flag `isDefault: true` sul doc per rendering speciale in UI (non cancellabile dalla UI) |
| `frontend/src/app/services/note.ts` — **`getNotes()`** | Aggiungere **terzo stream** `events$`: per ogni calendario iscritto (owned o subscribed) → query `where('calendarId','==',calId)`. Merge con owned + shared streams. `myPermissions` settato a read-only per calendari non-owned |
| `frontend/src/app/services/note.ts` — **Guard `updateNote` / `deleteNote`** | Se `note.type='event'` e `note.calendarId` è di calendario non-owned → rifiuta (read-only) |
| `firestore.rules` | `calendars`: read se owner OR subscriber (EXISTS(subscribers/{uid})). Write se owner. `subscribers/{selfUid}`: create se `resource.data.uid == request.auth.uid` + esiste invite valido per quel calendario (oppure owner). Delete solo self. Events (notes con type='event'): write solo se `uid == request.auth.uid` AND `calendarId` punta a calendario owned. Read se sub del calendar |
| `firestore.indexes.json` | Index composito: `notes (calendarId, reminderTime)` per vista calendario efficiente |
| `frontend/src/app/services/note.ts` — **`createInvite()`** | Generalizzare: accetta `{ type: 'note' | 'calendar', resourceId }`. Backward-compatible con note esistenti |

### Logica chiave
- `subscribeToCalendar(token)`:
  1. Legge `invites/{token}`, verifica `type='calendar'` e non scaduto
  2. Batch: crea `calendars/{calId}/subscribers/{myUid}` con `notificationsEnabled: false`
  3. (Non modifica il doc calendar — owner non deve vedere la lista)
- `unsubscribeFromCalendar(calId)`:
  1. Delete subdoc `subscribers/{myUid}`
  2. Se ero subscriber e il cron mi sta inviando notifiche → smette automaticamente (cron legge subdoc)
- `deleteCalendar(calId)` (solo owner):
  1. Query tutti gli eventi `where('calendarId','==',calId)` → batch delete
  2. Query tutti gli inviti attivi per quel calendario → delete
  3. Query subcollection subscribers → delete (il cron vedrà zero sub e skipperà)
  4. Delete calendar doc
  5. Atomico con batch multiplo (Firestore batch = 500 ops max; se eventi > 500, loop)
- **Non** esponiamo `getSubscribersList(calId)` — volutamente non implementato. L'owner non ha modo di sapere chi è iscritto

### Rischi
- **Invite enumeration**: token 20 char alfanumerici, 62^20 ≈ 7×10^35 combinazioni → safe
- **Abuso subscribe**: utente malevolo potrebbe iscrivere migliaia di bot via script se ottiene il link. Soft mitigation: rate-limit client-side sul tasto "Aggiungi calendario". Hard mitigation (backlog): Cloud Function con limiter
- **Scaling events per calendar**: con 1000+ eventi la query `where('calendarId','==',...)` sulla vista mese carica tutto. Mitigazione: limitare la query per range temporale visibile (`where('reminderTime', '>=', monthStart)` + `where('reminderTime', '<=', monthEnd)`) → serve index composito
- **Cancellazione calendario con tanti eventi offline**: batch delete in più giri, mostra progress

### Testing Fase 3
- Crea calendario → appare in `getMyCalendars()`
- Genera invite → altro utente consuma → doc subscriber creato
- Owner cerca "chi è iscritto al mio calendario" → nessuna API lo espone (verifica manuale)
- Subscriber fa unsubscribe → subdoc eliminato, calendario scompare dalla sua vista
- Owner elimina calendario → tutti gli eventi cascade-deleted, sub subdocs eliminati
- Subscriber tenta update di un evento → rules rifiutano

---

## Fase 4 — Eventi: creazione, editing, spostamento tra calendari

Obiettivo: UI completa per creare/modificare eventi legati a calendari.

### File da modificare
| File | Modifica |
|------|----------|
| `frontend/src/app/components/note-editor/note-editor.ts + .html` | Se `type='event'`:<br>- Picker calendario in header (default: calendario personale se esistente, altrimenti primo owned)<br>- Reminder picker con recurrence (riusa UI memo)<br>- Placeholder title diverso ("Nuovo evento")<br>- Menù "Sposta in altro calendario" (mostra solo calendari owned, non subscribed)<br>- Se evento è in calendario non-owned (read-only) → editor in modalità view, banner "Sola lettura — calendario condiviso di @username" |
| **Nuovo** `frontend/src/app/components/calendar-picker/calendar-picker.component.ts` | Dropdown selezione calendario. Input: `calendars: Calendar[]`. Output: `(select)`. Raggruppa per "I miei" / "Iscritto" se riusato altrove; in editor event usa solo "I miei" |
| `frontend/src/app/services/note.ts` — **`moveEventToCalendar(eventId, newCalendarId)`** | Aggiorna `calendarId` solo se nuovo calendario è owned dallo stesso uid. Validazione rules lato server |
| `frontend/src/app/components/dashboard/dashboard.ts` | `activeView='calendar'`: il calendario mostra eventi di **tutti i calendari visibili** (vedi Fase 5 per filtro) + memo se toggle attivo |
| `frontend/src/app/components/note-editor/note-editor.ts` — **Action menù** | Per `type='event'`: aggiungi toggle "Annulla evento" (setta `cancelled=true` invece di deletedelete). Evento cancellato rimane visibile ma stilizzato con strikethrough + etichetta "Annullato". Solo owner |
| **Calendar view component** | Rendering differenziato:<br>- Memo → colore dot + titolo, click → editor memo<br>- Evento proprio → color dot del calendario + titolo, click → editor event<br>- Evento di calendario iscritto → color dot del calendario + titolo + piccolo badge "👥" (o icona SVG), click → editor read-only<br>- Evento cancellato → strikethrough |
| `frontend/src/assets/i18n/it.json` | `EVENT.NEW`, `EVENT.MOVE_TO_CALENDAR`, `EVENT.READ_ONLY_BANNER`, `EVENT.CANCEL`, `EVENT.CANCELLED_BADGE`, `CALENDAR.PICKER_OWNED`, `CALENDAR.PICKER_PERSONAL` |

### Logica chiave
- Creazione evento richiede sempre `calendarId` → se utente non ha calendari, flow forzato "crea calendario prima" (magari dal FAB → dialog auto-create "Personale")
- Editor distingue owner vs subscriber via `note.calendarOwnerUid` (denormalizzato in lettura) vs `currentUid`
- `cancelled` è opt-in: l'evento non scompare dal calendario, resta visibile come "annullato" → subscriber non riceve notifica se cancelled==true (cron filter)

### Testing Fase 4
- Creo evento in calendario A → salvato con `calendarId=A`
- Sposto evento in calendario B (owned) → `calendarId=B`
- Sposto evento in calendario subscribed (non-owned) → UI non espone l'opzione, rules bloccano
- Cancello evento (non delete) → strikethrough in vista, subscriber non riceve notifica successiva
- Subscriber apre evento read-only → editor non permette save

---

## Fase 5 — Vista calendario aggiornata (modale di controllo)

Obiettivo: centralizzare nella modale calendario (i) toggle memo, (ii) scelta calendari visibili, (iii) CTA aggiungi da link.

### File da modificare
| File | Modifica |
|------|----------|
| `frontend/src/app/components/calendar-view/calendar-view.component.ts + .html + .scss` | Ridisegno:<br>- Header: mostra titolo "Calendario" + pulsante filtri (icona sliders) → apre modale<br>- Body: griglia mese (comportamento attuale) ma render evento da **tutti i calendari visibili** (intersezione `getMyCalendars()` ∪ `getSubscribedCalendars()` ∩ `view.visibleCalendarIds`)<br>- Color dot per calendario (ogni evento mostra il colore del suo calendario, non della nota) |
| **Nuovo** `frontend/src/app/components/calendar-filter-dialog/calendar-filter-dialog.component.ts + .html + .scss` | Modale con:<br>1. **Toggle "Mostra memo sul calendario"** (default ON)<br>2. **Lista calendari visibili**: checkbox per ogni calendario owned/subscribed. "Personale" sempre attivo e non disattivabile.<br>3. **CTA "Aggiungi calendario"** → secondo step modale: input "incolla link" + bottone "Aggiungi". Chiama `subscribeToCalendar(tokenFromLink)`<br>4. **Per ogni calendario iscritto**: swipe/long-press o icona `⋯` → azioni "Notifiche on/off" + "Annulla iscrizione" |
| `frontend/src/app/services/note.ts` — **`getUserPreference`/`setUserPreference`** | Nuova chiave `calendarView`: `{ showMemos: boolean, hiddenCalendarIds: string[] }`. Persistita in `users/{uid}` |
| `frontend/src/app/components/calendar-view/calendar-view.component.ts` | Al init: legge `calendarView` prefs → applica filtri. Al toggle modale → scrive prefs (`setUserPreference`) |
| **Routing / Deep link** | Il link calendar share ha forma `https://.../?calendar-invite=<token>` (sullo stesso pattern di `?invite=`). Al login/redirect: se token calendar presente → apre modale conferma "Vuoi iscriverti al calendario X di @username?" → call `subscribeToCalendar(token)` |
| `frontend/src/app/components/note-editor/note-editor.ts` — **Share action evento** | Per evento in calendario owned: il pulsante share NON genera invito al singolo evento (non supportato) → mostra toast "Per condividere questo evento, condividi il calendario <nome>" con shortcut al menù calendario |
| **Nuovo** `frontend/src/app/components/calendar-manage/calendar-manage.component.ts` | Pagina/modale gestione dei calendari owned: rinomina, cambia colore, genera/revoca invite link, elimina. Accesso via icona "⚙" in calendar-filter-dialog accanto a ogni owned |
| `frontend/src/assets/i18n/it.json` | `CALENDAR.FILTER_TITLE`, `CALENDAR.SHOW_MEMOS`, `CALENDAR.VISIBLE_CALENDARS`, `CALENDAR.ADD_FROM_LINK`, `CALENDAR.LINK_PLACEHOLDER`, `CALENDAR.UNSUBSCRIBE_CONFIRM`, `CALENDAR.NOTIFICATIONS_TOGGLE`, `CALENDAR.PERSONAL_DEFAULT` |

### Logica chiave
- **Ordine rendering eventi**: prima ordine cronologico, poi in caso di stesso giorno raggruppa per calendario con dot-color
- **Personale sempre on**: checkbox disabilitato con tooltip "Il calendario personale è sempre visibile"
- **Paste link invalido**: errore UI specifico (token non trovato / scaduto / già iscritto)

### Testing Fase 5
- Aggiungi calendario incollando link → appare nella lista + vista mese popolata
- Toggle memo off → solo eventi in vista mese
- Unsub calendario → eventi rimossi dalla vista, prefs aggiornate
- Persistenza: refresh pagina → stato modale ripristinato
- Personale non disattivabile → UI lo impedisce

---

## Fase 6 — Notifiche eventi (cron + opt-in)

Obiettivo: il server invia push per eventi solo ai sub con opt-in attivo.

### File da modificare
| File | Modifica |
|------|----------|
| `server/index.js` | Estendere query reminder: oltre a `notes where reminderStatus='pending' AND reminderTime<=now`, per gli eventi (`type='event'`) serve lookup subscribers del relativo `calendarId` filtrando `notificationsEnabled=true` → invio FCM multicast solo ai loro `fcmTokens`. Skip se `cancelled=true` |
| `server/index.js` — **Memo** | Invariati: inviano all'owner come oggi |
| `server/index.js` — **Events** | Nuova branch: per ogni evento pending → fetch `calendars/{calId}/subscribers` where `notificationsEnabled=true` → per ogni sub fetch `users/{uid}.fcmTokens` → multicast. Marca evento `reminderStatus='sent'` |
| `frontend/src/app/components/calendar-filter-dialog` | Toggle "Notifiche" per calendario non-owned: chiama `toggleCalendarNotifications(calId, enabled)` → update subdoc `subscribers/{myUid}.notificationsEnabled` |
| `frontend/src/app/components/calendar-manage` | Per calendari **owned**: toggle notifiche propri (equivale a `subscribers/{ownerUid}.notificationsEnabled`). Default ON per owner |
| `firestore.rules` | Subdoc `subscribers/{selfUid}`: update di `notificationsEnabled` consentito solo al sub stesso |
| **Documentazione server** | Aggiornare `server/scripts/README.md` con nuovo schema subscribers |

### Logica chiave
- Cron deve gestire volume: con 100 sub × 50 eventi/mese × notifiche → ~5000 push. cron-job.org (granularità 1 min) regge senza problemi per questo ordine di grandezza.
- **Deduplicazione**: se un utente è sub di 3 calendari che hanno tutti un evento alle 18:00, riceve 3 push distinte. Non deduplichiamo per ora (accettabile)
- **Owner di un calendario non riceve notifiche per i propri eventi a meno che non abbia `notificationsEnabled=true` sul suo subdoc**: owner è auto-iscritto al setup con ON di default

### Rischi
- **FCM token scaduti**: già gestiti (cleanup on failure)
- **Sub iscritto senza fcmToken** (es. disabilitò notifiche browser): skip silente

### Testing Fase 6
- Owner crea evento fra 1 min → riceve push
- Sub con notif OFF → no push per evento nuovo
- Sub con notif ON → push arriva
- Evento cancelled → nessuna push inviata
- Multi-device owner → push a tutti i token

---

## Backlog (post-MVP)

### BL-1 — E2E p2p per note condivise
Cifrare nota con chiave simmetrica; cifrare simmetrica con pub key di ogni collaboratore. Richiede:
- Accesso pubblico a `users/{uid}.publicKey` (rules da allentare)
- Ri-cifratura simmetrica su add/remove collaborator
- Rotazione simmetrica su remove (per vera revoca)
- Non si applica ai calendari (modello feed, niente identità pre-registrata)

### BL-2 — Co-editor calendari
Aggiungere ruolo `editor` in `subscribers/{uid}` con `role: 'owner' | 'editor' | 'subscriber'`. Invito mirato via username (non via link). Rules permettono ai role='editor' di scrivere eventi di quel calendario.

### BL-3 — Immagini in subcollection media
Se il document size diventa problema, spostare `image` in `notes/{id}/media/cover`. Letture on-demand in editor/card-tap. Query list non scarica media.

### BL-4 — Deduplicazione notifiche multi-calendario
Se un utente ha più calendari con evento stessa ora, unificare in singola push.

### BL-5 — Suggerimenti calendari pubblici
Directory di calendari pubblici "scoperti" (per ora fuori scope completo).

### BL-6 — Condivisione singolo evento
Share di un evento singolo (non l'intero calendario). Complica il modello. Valutare solo se richiesto.

---

## Ordine consigliato di esecuzione

```
Fase 0 (schema/migrazione)  →  DEPLOY silenzioso
Fase 1 (muro netto UX)      →  DEPLOY, feedback utenti
Fase 2 (immagine)           →  DEPLOY incrementale
Fase 3 (calendar entity)    →  DEPLOY (ancora nessuna UI cal-sharing)
Fase 4 (eventi UI)          →  DEPLOY
Fase 5 (modale calendar)    →  DEPLOY
Fase 6 (notifiche)          →  DEPLOY finale
```

Ogni fase è **indipendentemente rilasciabile**. Fase 1 può arrivare in produzione prima delle altre senza bloccare nulla — è già valore per l'utente (fix confusione note/memo).

---

## Decisioni finali (confermate 2026-04-22)

| # | Tema | Decisione |
|---|------|-----------|
| 1 | Naming tab | **"Promemoria"** (sostituisce "Reminders"). Tab diventa: Note · Promemoria · Calendario |
| 2 | Calendario Personale | **Auto-creato lazy** al primo tap "Evento" nel FAB se l'utente non ha calendari. Flag `isDefault: true`, non rinominabile né eliminabile |
| 3 | Limite immagine | **200KB post-compressione**, 1024px lato lungo, JPEG qualità 0.7. Valutare aumento solo se quality test Fase 2 evidenzia problemi |
| 4 | Scadenza invite calendario | **30 giorni**. Owner può rigenerare il link (revoca token precedenti, NON caccia già iscritti). Note restano 7 giorni come oggi |
| 5 | Notifiche owner | **Default ON**. Owner auto-iscritto a `calendars/{id}/subscribers/{ownerUid}` con `notificationsEnabled: true`. Toggle in gestione calendario |
| 6 | Eliminazione calendario con eventi | **Dialog conferma con count esplicito** ("Contiene N eventi, perderai tutto"). Nessun archivio, cascade delete |
| 7 | Color picker calendario | **Palette fissa 8 colori M3** coordinati con theme token. No HEX libero. Include "Nessun colore" = default |
| 8 | FAB "Evento" con 0 calendari | **Auto-crea "Personale" silenzioso + apre editor evento**. Zero friction |

---

## Metriche di successo

- Zero regressioni su creazione/modifica note esistenti (E2E suite verde)
- Utente crea evento in <3 tap dal FAB
- Link calendario condiviso → subscribe in <5 secondi
- Cron invia notifiche con lag <60s
- Nessun utente perde dati post-migrazione Fase 0 (verifica count documenti pre/post)
