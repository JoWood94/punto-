status: done
agent: alpha
task: Nuova pagina Impostazioni + restyling menu tre puntini

## Obiettivo
1. Voci del menu tre puntini (more_vert): sfondo nero con testo bianco
2. Nuova voce "Impostazioni" nel menu tre puntini → naviga a una nuova pagina `/settings`
3. Pagina impostazioni con due sezioni

---

## Fix 1 — Stile menu tre puntini

In `dashboard.scss` (o dove viene stilato `mat-menu`), aggiungere stile globale per le voci del menu:
```scss
.mat-mdc-menu-panel {
  background: var(--punto-primary, #1C1B1F) !important;
}
.mat-mdc-menu-item {
  color: #FFFFFF !important;
  .mat-icon { color: #FFFFFF !important; }
}
.mat-mdc-menu-item:hover {
  background: rgba(255,255,255,0.08) !important;
}
```

Verifica dove è già definito lo stile del menu e aggiorna lì invece di duplicare.

---

## Fix 2 — Voce "Impostazioni" nel menu tre puntini

In `dashboard.html`, nel `mat-menu` del bottone more_vert, aggiungere in fondo alla lista delle voci:
```html
<button mat-menu-item (click)="openSettings()">
  <mat-icon>settings</mat-icon>
  Impostazioni
</button>
```

In `dashboard.ts`, aggiungere il metodo:
```typescript
openSettings() {
  this.router.navigate(['/settings']);
}
```

---

## Fix 3 — Nuova pagina Impostazioni

### Route
In `app.routes.ts`, aggiungere:
```typescript
{ path: 'settings', component: SettingsComponent, canActivate: [AuthGuard] }
```

### Componente `settings`
Creare `frontend/src/app/components/settings/` con:
- `settings.component.ts`
- `settings.component.html`
- `settings.component.scss`

### Struttura UI della pagina

**Header:** back arrow + titolo "Impostazioni" (stesso pattern dell'editor)

**Sezione 1 — Vista di default** (solo mobile)
- Label sezione: "Interfaccia mobile"
- Sotto-label piccola: "Su desktop lista e calendario sono sempre mostrati insieme"
- Radio group con due opzioni: "Note" | "Calendario"
- Default: "Note"
- Salva in `localStorage` (chiave: `punto_default_view`) — stessa chiave già usata in `dashboard.ts` per `defaultViewKey`
- Il setting è visivamente distinto o con una label "(solo mobile)" accanto al titolo sezione

**Sezione 2 — Titolo nelle notifiche**
- Label: "Titolo visibile nelle notifiche"
- Toggle (mat-slide-toggle), default: OFF
- Sotto il toggle, testo esplicativo:
  > "Attivando questa opzione, il titolo della nota verrà salvato senza cifratura per poter essere incluso nelle notifiche push. Il testo del titolo sarà leggibile da chiunque abbia accesso al database."
- Quando il toggle viene attivato: salva `{ notifTitleEnabled: true }` in `users/{uid}` su Firestore
- Quando disattivato: salva `{ notifTitleEnabled: false }`
- Al caricamento della pagina: legge `users/{uid}.notifTitleEnabled` per mostrare lo stato attuale

### Note implementative
- Usa Angular Material per tutti i componenti (mat-radio-group, mat-slide-toggle, mat-divider)
- Design coerente con il resto dell'app: sfondo `--punto-bg`, testi `--punto-primary`
- La pagina NON ha bottom nav né sidenav — solo header con back e contenuto
- Usa `impeccable:frontend-design` per la struttura UI prima di implementare

---

## Output atteso
- Stile menu aggiornato
- Voce "Impostazioni" nel menu funzionante
- Nuova pagina `/settings` navigabile e funzionante
- Build production OK
- Aggiorna questo file con `status: done` e `completed:`

## ⛔ NO deploy — attendo validazione Giuseppe in locale
completed: styles.scss: menu dark (#1C1B1F bg, testo bianco, hover rgba). dashboard.html: voce "Impostazioni" aggiunta. dashboard.ts: openSettings(). app.routes.ts: route /settings con authGuard. Nuovo componente settings/ (ts+html+scss): sezione vista default con radio card + sezione notifTitle con slide-toggle, tutto via NoteService.getUserPreference/setUserPreference.
