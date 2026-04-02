status: done
agent: alpha
task: Tre miglioramenti UX dashboard — sezioni lista, promemoria ripetuti, swipe mobile
completed: vedi IMPL-07-ux-dashboard.md (refactoring completato lì con fix aggiuntivi in IMPL-08)

---

## 1. Sezioni nella lista note (pinned / non-pinned)

**File:** `dashboard.html`, `dashboard.ts`, `dashboard.scss`

Attualmente le note pinnate sono già ordinate per prime via sort. Aggiungi una separazione visiva:

- Se ci sono note pinnate **E** non pinnate: mostra due sezioni con header
  - `"Fissate"` → le note con `pinned: true`
  - `"Note"` → le restanti
- Se ci sono SOLO note pinnate o SOLO non pinnate: **nessun header**, lista unica (evita sezione da 0 elementi)
- Header sezione: label piccola, tono neutro (usa `mat-subheader` o una `<div class="section-label">` stilizzata in SCSS)

In `dashboard.ts`: crea due getter/computed:
```typescript
get pinnedNotes(): Note[] { return this.filteredNotes.filter(n => n.pinned); }
get unpinnedNotes(): Note[] { return this.filteredNotes.filter(n => !n.pinned); }
```

In `dashboard.html`: sostituisci il singolo `*ngFor` con la logica a sezioni.

---

## 2. Promemoria ripetuti nel calendario

### 2a. Note interface (note.ts)
Aggiungi campo opzionale:
```typescript
reminderRepeat?: 'daily' | 'weekly' | 'monthly' | 'yearly';
```

### 2b. UI in note-editor
**File:** `note-editor.component.html` / `note-editor.component.ts`

Nel blocco reminders (dove si imposta `reminderTime`), aggiungi un `<mat-select>` per la ripetizione:
```
Nessuna ripetizione | Ogni giorno | Ogni settimana | Ogni mese | Ogni anno
```
- Visibile solo se `reminderTime` è impostato
- Bind a `note.reminderRepeat`
- Salva insieme alla nota

### 2c. Logica calendario (calendar-view.component.ts)
Modifica `getNotesForDate(date: Date): Note[]` (o equivalente) in modo che:

1. Per ogni nota con `reminderRepeat`, calcola se la data richiesta è una ricorrenza valida a partire da `reminderTime`:
   - `daily`: ogni giorno dopo `reminderTime`
   - `weekly`: stesso giorno della settimana
   - `monthly`: stesso giorno del mese
   - `yearly`: stesso giorno e mese

2. La nota restituita è **sempre la stessa istanza** (stesso `id`), non una copia — il click apre la nota originale.

3. Nel chip/evento del calendario, mostra un'icona di ripetizione (usa `repeat` di Material Icons) accanto al bell icon se `reminderRepeat` è impostato.

---

## 3. Swipe mobile tra lista e calendario

**File:** `dashboard.html`, `dashboard.ts`, `dashboard.scss`

Sul container principale del contenuto (l'area destra, non il sidenav), aggiungi gestione touch:

In `dashboard.ts`:
```typescript
private touchStartX = 0;

onTouchStart(e: TouchEvent) {
  this.touchStartX = e.touches[0].clientX;
}

onTouchEnd(e: TouchEvent) {
  const deltaX = e.changedTouches[0].clientX - this.touchStartX;
  if (Math.abs(deltaX) < 60) return; // threshold
  if (deltaX < 0 && this.currentMainView === 'list') {
    this.switchToCalendar(); // swipe left → calendario
  } else if (deltaX > 0 && this.currentMainView === 'calendar') {
    this.switchToList(); // swipe right → lista
  }
}
```

In `dashboard.html`: aggiungi `(touchstart)` e `(touchend)` al wrapper del contenuto principale (solo se `isMobile`).

Usa i metodi esistenti per il cambio vista (non duplicare logica).

---

## Note operative
- Non modificare la logica di sort esistente — i getter pinnedNotes/unpinnedNotes operano su `filteredNotes` già ordinato
- Per il calendario, non introdurre note virtuali/cloni — restituire sempre la nota originale
- Lo swipe non deve interferire con lo scroll verticale (usa solo deltaX con threshold adeguato)
