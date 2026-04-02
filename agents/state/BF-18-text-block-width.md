status: done
agent: alpha
task: Fix larghezza blocco TESTO — non occupa tutta la larghezza disponibile

## Bug

In `note-editor.html`, il blocco TEXT (righe 23-42) usa `<div class="rich-text-wrapper">` senza `flex: 1`.
Gli altri blocchi (checklist, location, reminder, link) usano `.metadata-section` che ha `flex: 1; min-width: 0` → si espandono correttamente.
Il blocco TESTO invece si restringe alla larghezza naturale del contenuto, risultando ~metà schermo su mobile.

## Fix — SCSS (1 riga)

In `note-editor.component.scss`, aggiungi `flex: 1` e `min-width: 0` a `.rich-text-wrapper`:

```scss
.rich-text-wrapper {
  flex: 1;          // ← aggiungere
  min-width: 0;     // ← aggiungere
  display: flex;
  flex-direction: column;
  min-height: 100px;
  background: var(--mat-sys-surface);
  border: 1px solid var(--mat-sys-outline-variant);
  border-radius: var(--punto-shape-lg, 16px);
  padding: 12px 16px;
}
```

## Verifica

Dopo il fix: apri nota con 2+ blocchi TESTO su mobile (o DevTools mobile) → le card devono occupare tutta la larghezza disponibile (come checklist/location).

## ⛔ NO deploy — attendo validazione Giuseppe in locale
completed: aggiunto flex:1 e min-width:0 a .rich-text-wrapper in note-editor.scss
bloccato_da:
