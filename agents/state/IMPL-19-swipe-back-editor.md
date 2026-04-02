status: done
agent: alpha
task: Swipe orizzontale per uscire dalla nota (torna alla lista)

## Funzionalità

Su mobile, quando l'utente è nella vista editor nota (`activeNote !== undefined`), uno swipe verso destra chiude l'editor e torna alla lista — equivalente a premere il back button nell'header.

## Implementazione — dashboard.ts

Lo swipe handler esistente (`onTouchEnd`) già gestisce swipe orizzontale tra lista e calendario. Estenderlo con un terzo caso:

```typescript
onTouchEnd(e: TouchEvent) {
  if (!this.isMobile) return;
  const deltaX = e.changedTouches[0].clientX - this.touchStartX;
  const deltaY = e.changedTouches[0].clientY - this.touchStartY;
  if (Math.abs(deltaY) > Math.abs(deltaX)) return;
  if (Math.abs(deltaX) < 60) return;

  // Swipe destra nell'editor → torna indietro
  if (deltaX > 0 && this.activeNote !== undefined) {
    this.handleBackButton();
    return;
  }
  // Swipe sinistra su lista → calendario
  if (deltaX < 0 && this.currentMainView === 'list' && this.activeNote === undefined) {
    this.setDefaultView('calendar');
  }
  // Swipe destra su calendario → lista
  else if (deltaX > 0 && this.currentMainView === 'calendar' && this.activeNote === undefined) {
    this.setDefaultView('list');
  }
}
```

## Note

- La soglia 60px è già appropriata
- Il filtro `|deltaY| > |deltaX|` già presente previene conflitti con lo scroll verticale
- `handleBackButton()` già gestisce correttamente la chiusura (salvataggio + navigazione)
- Non serve nessuna modifica CSS

## ⛔ NO deploy — attendo validazione Giuseppe in locale
completed: dashboard.ts: onTouchEnd() — aggiunto caso swipe destra con activeNote !== undefined → handleBackButton(). Le condizioni lista↔calendario ora usano activeNote === undefined per evitare conflitti.
bloccato_da:
