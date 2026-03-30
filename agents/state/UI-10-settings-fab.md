status: done
agent: alpha
task: Floating settings button con menu M3 Expressive + logout spostato dentro

## Obiettivo
Creare un FAB impostazioni fluttuante bottom-left nella sidenav, con menu espandibile
animato M3 Expressive. Spostare logout dentro il menu e rimuoverlo dagli altri punti.

---

## Posizionamento

### Default (lista note visibile — desktop e mobile)
- Il FAB impostazioni è fixed bottom-left DENTRO `.notes-sidenav`
- Position: `position: absolute; bottom: 16px; left: 16px;`
- Sempre visibile mentre la sidenav è aperta

### Mobile — vista calendario (sidenav nascosta)
- Il FAB impostazioni si sposta nell'`app-header` al posto del logout
- Stessa posizione dove ora c'è `<button mat-icon-button (click)="logout()"` nelle righe 117-120
- Usa `mat-icon-button` (non FAB extended) per stare nell'header

---

## Il menu (M3 Expressive Speed Dial)

Quando si clicca il FAB impostazioni, si apre un menu verticale che si espande verso l'alto.
Ogni voce ha: icona + label, animazione slide-up + fade-in con stagger.

### Voci del menu (per ora solo logout)
1. **Logout** — icona `logout`, label "Esci", chiama `logout()`

### Animazione (M3 motion)
- Durata: 200ms (`--punto-duration-medium1`)
- Easing: `--punto-easing-standard` (cubic-bezier(0.2, 0, 0, 1))
- Ogni voce: `translateY(8px) → translateY(0)` + `opacity: 0 → 1`
- Stagger: 40ms tra una voce e l'altra
- Il FAB ruota da `settings` a `close` (rotate 90deg) quando aperto

### Chiusura
- Click sul FAB → chiude
- Click fuori dal menu (backdrop invisible) → chiude

---

## Modifiche HTML (dashboard.html)

### RIMUOVERE questi bottoni logout esistenti:
- Riga 14: `<button mat-icon-button (click)="logout()"` nel mobile sidenav header
- Righe 117-120: `<button mat-icon-button *ngIf="isMobile && currentMainView === 'calendar'...` logout
- Riga 136: `<button mat-icon-button (click)="logout()" *ngIf="!isMobile"` nel desktop header

### AGGIUNGERE il FAB impostazioni in fondo alla sidenav
Dentro `<div style="display: flex; flex-direction: column; height: 100%;">`,
DOPO `</div>` della `.notes-list`, PRIMA del `</div>` del flex container:

```html
<!-- Settings FAB — bottom-left sidenav -->
<div class="settings-fab-container" *ngIf="!isMobile || currentMainView !== 'calendar'">
  <!-- Backdrop -->
  <div class="settings-backdrop" *ngIf="settingsMenuOpen" (click)="closeSettingsMenu()"></div>

  <!-- Menu items (espanso verso l'alto) -->
  <div class="settings-menu" [class.settings-menu-open]="settingsMenuOpen">
    <div class="settings-menu-item" (click)="logout(); closeSettingsMenu()">
      <button mat-mini-fab class="settings-item-btn" aria-label="Logout">
        <mat-icon>logout</mat-icon>
      </button>
      <span class="settings-item-label">Esci</span>
    </div>
  </div>

  <!-- FAB principale -->
  <button mat-mini-fab class="settings-fab" (click)="toggleSettingsMenu()"
          aria-label="Impostazioni"
          [class.settings-fab-open]="settingsMenuOpen">
    <mat-icon>settings</mat-icon>
  </button>
</div>
```

### AGGIUNGERE il bottone impostazioni nell'header mobile calendario
Al posto del logout rimosso (righe 117-120), aggiungi:

```html
<!-- Mobile calendario: settings al posto del logout -->
<button mat-icon-button
        *ngIf="isMobile && currentMainView === 'calendar' && activeNote === undefined"
        (click)="toggleSettingsMenu()"
        aria-label="Impostazioni"
        [class.settings-fab-open]="settingsMenuOpen">
  <mat-icon>{{ settingsMenuOpen ? 'close' : 'settings' }}</mat-icon>
</button>

<!-- Menu dropdown mobile calendario (si apre verso il basso dall'header) -->
<div class="settings-menu-calendar"
     *ngIf="isMobile && currentMainView === 'calendar' && settingsMenuOpen">
  <div class="settings-backdrop" (click)="closeSettingsMenu()"></div>
  <div class="settings-dropdown">
    <div class="settings-menu-item" (click)="logout(); closeSettingsMenu()">
      <mat-icon>logout</mat-icon>
      <span>Esci</span>
    </div>
  </div>
</div>
```

---

## Modifiche TypeScript (dashboard.ts)

Aggiungi:
```typescript
settingsMenuOpen = false;

toggleSettingsMenu(): void {
  this.settingsMenuOpen = !this.settingsMenuOpen;
}

closeSettingsMenu(): void {
  this.settingsMenuOpen = false;
}
```

---

## Modifiche SCSS (dashboard.scss)

```scss
// ─── Settings FAB container ─────────────────────────────────
.settings-fab-container {
  position: absolute;
  bottom: 16px;
  left: 16px;
  display: flex;
  flex-direction: column-reverse;
  align-items: flex-start;
  gap: 12px;
  z-index: 10;
}

.settings-fab {
  background: var(--punto-primary) !important;
  color: white !important;
  width: 40px;
  height: 40px;
  transition: transform var(--punto-duration-medium1) var(--punto-easing-standard);

  mat-icon {
    transition: transform var(--punto-duration-medium1) var(--punto-easing-standard);
  }

  &.settings-fab-open mat-icon {
    transform: rotate(90deg);
  }
}

// ─── Menu items ──────────────────────────────────────────────
.settings-menu {
  display: flex;
  flex-direction: column-reverse;
  gap: 8px;
  pointer-events: none;
}

.settings-menu.settings-menu-open {
  pointer-events: all;
}

.settings-menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  opacity: 0;
  transform: translateY(8px);
  transition:
    opacity var(--punto-duration-medium1) var(--punto-easing-standard),
    transform var(--punto-duration-medium1) var(--punto-easing-standard);

  .settings-menu-open & {
    opacity: 1;
    transform: translateY(0);
  }

  // stagger: ogni item +40ms (aggiungi &:nth-child(N) se ci sono più voci)
  &:nth-child(1) {
    transition-delay: 0ms;
  }
  &:nth-child(2) {
    transition-delay: 40ms;
  }
}

.settings-item-btn {
  background: var(--punto-surface-variant, #EEECF0) !important;
  color: var(--punto-primary) !important;
  width: 36px;
  height: 36px;
  flex-shrink: 0;
}

.settings-item-label {
  background: var(--mat-sys-surface);
  color: var(--mat-sys-on-surface);
  padding: 4px 12px;
  border-radius: var(--punto-shape-sm);
  font-size: 0.875rem;
  font-weight: 500;
  box-shadow: var(--punto-shadow-2);
  white-space: nowrap;
}

// ─── Backdrop ────────────────────────────────────────────────
.settings-backdrop {
  position: fixed;
  inset: 0;
  z-index: -1;
}

// ─── Mobile calendario: dropdown dall'header ─────────────────
.settings-menu-calendar {
  position: fixed;
  top: 56px; // altezza header
  right: 8px;
  z-index: 100;
}

.settings-dropdown {
  background: var(--mat-sys-surface);
  border-radius: var(--punto-shape-md);
  box-shadow: var(--punto-shadow-3);
  padding: 8px 0;
  min-width: 160px;
  animation: dropdown-in var(--punto-duration-medium1) var(--punto-easing-standard);

  .settings-menu-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 16px;
    cursor: pointer;
    opacity: 1;
    transform: none;
    transition: background var(--punto-duration-short2);

    &:hover {
      background: var(--mat-sys-surface-variant);
    }

    mat-icon { color: var(--punto-primary); font-size: 20px; }
    span { font-size: 0.9rem; color: var(--mat-sys-on-surface); }
  }
}

@keyframes dropdown-in {
  from { opacity: 0; transform: translateY(-8px) scale(0.96); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}
```

---

## Verifica
- Desktop: FAB settings visibile bottom-left sidenav, logout NON presente nell'header
- Mobile lista: FAB settings visibile bottom-left sidenav, logout NON nel sidenav header
- Mobile calendario: icona settings nell'header top-right, menu dropdown verso il basso
- Click fuori chiude il menu
- Animazione settings → close sull'icona FAB quando aperto

## Completamento
Aggiorna questo file con status: done + completato: Aggiunto `settingsMenuOpen` + `toggleSettingsMenu()` + `closeSettingsMenu()` in dashboard.ts. In dashboard.html: rimossi 3 bottoni logout (mobile sidenav header, mobile calendar header, desktop header). Aggiunto settings-fab-container con speed dial (backdrop + menu items animati + FAB) in fondo alla sidenav, visibile quando !isMobile || currentMainView !== 'calendar'. Aggiunto bottone settings + dropdown nell'header mobile calendario. In dashboard.scss: aggiunto `position: relative` a .notes-sidenav, `padding-bottom: 72px` a .notes-list, tutti gli stili Settings FAB/menu/backdrop/dropdown con animazioni M3 Expressive. [descrizione]
