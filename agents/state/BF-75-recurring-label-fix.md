status: done
agent: alpha
task: Fix label bottone ricorrente — sempre "Segna come evaso", non "Evaso — prossima"

## Problema

In `note-editor.ts`, `getReminderActionLabel` restituisce "Evaso — prossima [data]" quando
`block.time < Date.now()`. Ma il bottone actionable è visibile PRIMA che l'utente clicchi
(stato pending), e deve mostrare sempre "Segna come evaso".

"Evaso — prossima [data]" deve apparire solo nel **badge** (dopo il click, quando `_evaded = true`),
non nel bottone pre-click.

## Fix in `note-editor.ts`

```typescript
getReminderActionLabel(block: any): string {
  // Il bottone mostra sempre "Segna come evaso" — il badge mostra "Evaso — prossima [data]"
  return 'Segna come evaso';
}
```

Il metodo può restare per estensibilità futura, ma per ora restituisce sempre la stessa stringa.
In alternativa: rimuovere il metodo e mettere il literal direttamente nel template.

## Output atteso
- Fix in `note-editor.ts`
- Build production OK
- Aggiorna questo file con `status: done` e `completed:`

## ⛔ NO deploy — attendo validazione Giuseppe in locale
completed: note-editor.ts getReminderActionLabel(): semplificato a return 'Segna come evaso' — il label contestuale "Evaso — prossima [data]" appartiene al badge (_evaded), non al bottone. Build OK.
