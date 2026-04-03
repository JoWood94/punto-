status: done
agent: alpha
task: Fix "Cancella ricorrenza" — mantieni promemoria come una-tantum

## Comportamento attuale
In `note-editor.ts`, quando l'utente evade un ricorrente (`markReminderCompleted`, branch ricorrente),
non c'è più un dialog (rimosso da BF-66). Ma il cestino del blocco reminder non offre
un'opzione per "smettere di ripetere" mantenendo la data.

## Richiesta
Aggiungere una via per cancellare la ricorrenza mantenendo il promemoria come promemoria singolo.

### Approccio: bottone separato nel blocco reminder

Nel template `note-editor.html`, vicino al dropdown "Ripeti", quando `block.recurrence !== 'none'`
aggiungere un piccolo link/bottone "Cancella ricorrenza" che:
- Imposta `block.recurrence = 'none'`
- Mantiene `block.time` invariato (promemoria resta, data invariata)
- Mantiene `block.status` invariato
- Chiama `this.triggerAutoSave()`
- NON imposta `block.time = null` (questo era il vecchio comportamento sbagliato)

Posizionamento: sotto la riga del dropdown "Ripeti", testo piccolo, stile discreto (es. `mat-button` piccolo o link testuale).

### In `note-editor.ts`

Aggiungere il metodo:
```typescript
cancelRecurrence(block: any): void {
  block.recurrence = 'none';
  this.triggerAutoSave();
}
```

### Nel template (nota-editor.html)

Dopo il `mat-form-field` del select "Ripeti", aggiungere:
```html
<button mat-button class="cancel-recurrence-btn" type="button"
        *ngIf="$any(block).recurrence !== 'none'"
        (click)="cancelRecurrence($any(block))">
  Cancella ricorrenza
</button>
```

Stile in `note-editor.scss`:
```scss
.cancel-recurrence-btn {
  font-size: 12px;
  color: rgba(0,0,0,0.5);
  min-height: 28px;
  padding: 0 8px;
  margin-top: -4px;
}
```

## Output atteso
- Fix in `note-editor.ts`, `note-editor.html`, `note-editor.scss`
- Build production OK
- Aggiorna questo file con `status: done` e `completed:`

## ⛔ NO deploy — attendo validazione Giuseppe in locale
completed: note-editor.ts: aggiunto cancelRecurrence(block) — imposta block.recurrence='none' + triggerAutoSave(). note-editor.html: bottone "Cancella ricorrenza" dopo il campo Ripeti, visibile solo se recurrence!=='none'. note-editor.scss: .cancel-recurrence-btn con font 12px, opacity ridotta, altezza compatta. Build OK.
