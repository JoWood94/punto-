status: done
agent: alpha
task: Fix bottone "Evadi" non visibile su nota nuova con promemoria

## Bug
Quando si crea una nota nuova e si aggiunge un blocco promemoria, il bottone "Evadi"
non compare finché non si chiude e riapre la nota.

## Causa
In `isReminderActionable()` (`note-editor.ts`):
```typescript
if (!this.note?.id) return false;
```
Sulle note nuove, `this.note.id` è `undefined` — viene settato solo da `selectedNote`,
non dalla `createNote`. `this.savedNoteId` invece viene settato dopo che Firebase
risponde. Il bottone resta nascosto finché la nota non viene riaperta come nota esistente.

## Fix
In `initNote()`, `note-editor.ts`, riga ~237-239:
```typescript
// PRIMA
this.createNotePromise = this.noteService.createNote(this.buildPayload())
  .then(result => { this.savedNoteId = result.id; })

// DOPO
this.createNotePromise = this.noteService.createNote(this.buildPayload())
  .then(result => {
    this.savedNoteId = result.id;
    (this.note as any).id = result.id;
  })
```

## Output atteso
- Fix in `note-editor.ts`
- Build production OK
- ⛔ NO deploy — attendo validazione Giuseppe
completed: note-editor.ts — dopo createNote, (this.note as any).id = result.id. Build OK.
