status: done
agent: alpha
task: Fix layout note-editor iOS tastiera — NUOVO APPROCCIO (BF-17 v2)
completed: :host height→var(--vh, 100dvh) + max-height + position:relative; .editor-content padding bottom→calc(84px + safe-area + 16px); toolbar già usa [class.toolbar-hidden] con visibility:hidden — nessuna modifica HTML

## Problema reale identificato dal Team Lead

Il fix precedente (`max-height` su `.editor-content`) non funziona perché il bug è nel layer superiore:

- `:host` ha `height: 100%` dal parent, che probabilmente usa `height: 100vh` → non si aggiorna quando la tastiera apre
- Quando la tastiera apre, `--vh` è corretto (= visual viewport height ridotta), ma `:host` rimane all'altezza completa dello schermo
- `.editor-content` ha `max-height: calc(var(--vh) - 64px)` → corretto, ma lo spazio RIMANENTE dentro `:host` è vuoto e scrollabile visivamente
- La toolbar si sovrappone ai campi perché il layout non è vincolato all'altezza visibile

## Fix richiesto — 3 passi

### 1. `:host` — vincolare a --vh invece di 100%

In `note-editor.component.scss`:
```scss
:host {
  display: flex;
  flex-direction: column;
  /* CAMBIA: da height: 100% a: */
  height: var(--vh, 100dvh);
  max-height: var(--vh, 100dvh);
  /* resto invariato */
  background: var(--punto-bg);
  border-radius: 0;
  overflow: hidden;
  position: relative;
}
```

### 2. `.editor-content` — rimuovere max-height (ora ridondante)

Con `:host` vincolato a `--vh`, `.editor-content` con `flex: 1` prenderà automaticamente lo spazio rimanente senza overflow:
```scss
.editor-content {
  flex: 1;
  min-height: 0;
  /* RIMUOVI: max-height: calc(var(--vh, 100dvh) - var(--_editor-header-h)); */
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior-y: contain;
  padding: 0 24px calc(84px + env(safe-area-inset-bottom, 0px) + 16px);
}
```

### 3. Toolbar sovrapposta — verifica causa reale

Il `*ngIf` sul toolbar aggiunto nel fix precedente NON funziona (la toolbar è ancora visibile quando "Ora" è attivo nel screenshot).

Cerca nel template HTML il punto dove è posizionata la `floating-toolbar-area` e verifica:
- Quale condizione controlla `*ngIf` sulla toolbar
- Se `nonTextFieldFocused` viene effettivamente settato quando il time picker è aperto
- Se il time picker è un `<input type="time">` nativo o un Angular Material component — se è Mat, il focus event potrebbe non propagarsi come atteso

**Se il `*ngIf` non funziona su iOS**: alternativa sicura → usare `visibility: hidden` + `pointer-events: none` invece di `*ngIf`, oppure controllare il log in console per verificare se l'evento focus viene ricevuto. Come fallback accettabile: la toolbar può rimanere visibile ma non deve SOVRAPPORRE il campo attivo — il fix del `:host` height potrebbe già risolverlo perché il contenuto sarà scrollabile nello spazio corretto.

## Come procedere

1. Leggi `note-editor.component.scss` righe 1-120 (`:host`, `.editor-content`, `.floating-toolbar-area`)
2. Leggi il template HTML per trovare la condizione `*ngIf` sulla toolbar
3. Applica il fix al `:host` e `.editor-content` (passi 1 e 2 sopra)
4. Per la toolbar: verifica e applica il fix minimo necessario
5. Build production OK
6. Aggiorna questo file con `status: done` e `completed:`

## ⛔ NO deploy — attendo validazione Giuseppe in locale
