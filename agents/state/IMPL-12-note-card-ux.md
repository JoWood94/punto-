status: done
agent: alpha
task: 3 miglioramenti UX note card + swipe hint mobile
completed: dashboard.html, dashboard.ts, dashboard.scss — pinned-section-label con icona pin; getReminderTimeToday() + span orario reminder oggi; swipe-dots mobile statici

---

## 1. Etichetta sezione "Fissate" con icona pin

### Dove
In `dashboard.html`, dentro il blocco `*ngIf="pinnedNotes.length > 0 && unpinnedNotes.length > 0"`,
PRIMA del primo `*ngFor` delle note pinnate:

```html
<div class="pinned-section-label">
  <mat-icon>push_pin</mat-icon>
</div>
```

### Stile (dashboard.scss)
```scss
.pinned-section-label {
  display: flex;
  justify-content: flex-end;
  padding: 4px 6px 2px;

  mat-icon {
    font-size: 14px !important;
    width: 14px !important;
    height: 14px !important;
    color: var(--mat-sys-on-surface-variant);
    opacity: 0.5;
  }
}
```

---

## 2. Orario reminder di oggi nella note card

### Metodo da aggiungere in dashboard.ts
```typescript
getReminderTimeToday(note: Note): string | null {
  if (!note.reminderTime) return null;
  const today = new Date();
  const rem = new Date(note.reminderTime);
  if (rem.getFullYear() === today.getFullYear() &&
      rem.getMonth() === today.getMonth() &&
      rem.getDate() === today.getDate()) {
    return rem.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  }
  return null;
}
```

### Template (dashboard.html) — nel `noteCard` template, `.note-card-title-row`
Dopo `<mat-icon class="note-card-bell" *ngIf="note.reminderTime">notifications</mat-icon>`, aggiungere:

```html
<span class="note-card-time" *ngIf="getReminderTimeToday(note) as t">{{ t }}</span>
```

### Stile (dashboard.scss)
```scss
.note-card-time {
  font-size: 0.72rem;
  font-weight: 600;
  opacity: 0.85;
  flex-shrink: 0;
  letter-spacing: 0.01em;
}

// Eredita il colore dal contesto della card (bianco su primary, on-primary-container su active)
.note-card {
  .note-card-time { color: white; }
  &.active-note .note-card-time { color: var(--punto-on-primary-container); }
}
```

---

## 3. Swipe hint mobile (indicatore di paginazione)

### Dove in dashboard.html
DENTRO la `.notes-sidenav`, DOPO `</div>` del `.notes-list`, PRIMA del `<!-- Settings FAB -->`:

```html
<!-- Swipe hint mobile -->
<div class="swipe-dots" *ngIf="isMobile">
  <span class="swipe-dot dot-active"></span>
  <span class="swipe-dot"></span>
</div>
```

### Stile (dashboard.scss)
```scss
.swipe-dots {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 6px;
  padding: 10px 0 6px;
  flex-shrink: 0;

  .swipe-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--mat-sys-on-surface);
    opacity: 0.18;
    transition: opacity var(--_t), width var(--_t);
  }

  .dot-active {
    opacity: 0.55;
    width: 18px;
    border-radius: 3px;
  }
}
```

### Note
I dot sono statici (primo dot sempre active = lista). Non sono interattivi — servono solo come visual cue che suggerisce la presenza di un'altra schermata a destra. Non aggiungere logica di cambio stato.

---

## Verifica
- Desktop: nessuna modifica visibile (swipe-dots hidden via `*ngIf="isMobile"`, pinned-section-label visibile solo quando ci sono entrambi pinned e unpinned)
- Mobile: i due dot appaiono sotto la lista note
- Note card con reminder oggi: mostra orario (es. "14:30") a fianco del campanellino
- Note card con reminder futuro/passato: nessun orario mostrato (solo l'icona campanellino)
- Build production OK

## Output
Aggiorna questo file con `status: done` e `completed:` con i file modificati.
