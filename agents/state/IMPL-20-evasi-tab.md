status: done
agent: alpha
task: Tab selector nella lista note — "Note" e "Evasi"

## Funzionalità

Nella sidenav, aggiungere un tab selector compatto sopra la lista note con due voci:
- **Note** — lista normale (pinnedNotes + unpinnedNotes), comportamento attuale
- **Evasi** — solo le note con `reminderStatus === 'completed'`

Gli evasi spariscono dalla lista principale e sono visibili solo selezionando il tab "Evasi".

## Implementazione

### dashboard.ts

Aggiungere proprietà:
```typescript
activeListTab: 'notes' | 'evasi' = 'notes';
```

### dashboard.html

Sostituire/rimuovere la sezione "Evasi" esistente dal fondo della lista.

Aggiungere sopra la search bar (o subito sotto) un toggle compatto:
```html
<div class="list-tab-selector">
  <button [class.tab-active]="activeListTab === 'notes'" (click)="activeListTab = 'notes'">Note</button>
  <button [class.tab-active]="activeListTab === 'evasi'" (click)="activeListTab = 'evasi'">Evasi</button>
</div>
```

Nel contenuto della lista:
- Mostrare pinnedNotes/unpinnedNotes solo se `activeListTab === 'notes'`
- Mostrare completedReminderNotes solo se `activeListTab === 'evasi'`
- Empty state per "Evasi" se la lista è vuota: testo semplice "Nessun promemoria evaso."

### dashboard.scss — stile tab selector

Compatto, minimal, coerente col design:
```scss
.list-tab-selector {
  display: flex;
  margin: 6px 12px 0;
  background: var(--mat-sys-surface-variant, #f0f0f0);
  border-radius: 20px;
  padding: 2px;
  gap: 2px;

  button {
    flex: 1;
    border: none;
    background: transparent;
    border-radius: 18px;
    padding: 5px 0;
    font-size: 13px;
    font-family: var(--punto-font);
    color: rgba(0,0,0,0.55);
    cursor: pointer;
    transition: background 0.15s, color 0.15s;

    &.tab-active {
      background: var(--mat-sys-surface, #fff);
      color: var(--mat-sys-on-surface);
      font-weight: 500;
      box-shadow: 0 1px 3px rgba(0,0,0,0.10);
    }
  }
}
```

### Nascondere il tab "Evasi" se non ci sono evasi

Se `completedReminderNotes.length === 0`, nascondere il tab selector completamente (non mostrare un tab inutile).

## ⛔ NO deploy — attendo validazione Giuseppe in locale
completed: dashboard.ts: activeListTab='notes'|'evasi'. dashboard.html: tab selector visibile solo con evasi>0; lista note condizionale per tab; sezione evasi in fondo rimossa e sostituita dal tab. dashboard.scss: .list-tab-selector con pill style e .tab-active.
bloccato_da:
