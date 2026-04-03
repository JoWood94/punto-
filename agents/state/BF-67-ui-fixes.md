status: done
agent: alpha
task: Fix UI — label impostazioni + menu position desktop + PGP in card

## Fix 1 — Label sezione impostazioni

`settings.component.html` riga 13: cambia "Interfaccia mobile" → "Vista di default"

```html
<!-- Prima -->
<span class="section-label">Interfaccia mobile</span>

<!-- Dopo -->
<span class="section-label">Vista di default</span>
```

## Fix 2 — Menu impostazioni appare in top-left su desktop

`dashboard.html` riga 288: `<mat-menu #settingsMenu="matMenu" xPosition="before">`.
Su desktop il menu appare nell'angolo in alto a sinistra invece che vicino al bottone `⋮`.

Causa probabile: Angular Material `mat-menu` calcola la posizione dell'overlay rispetto al
trigger, ma su desktop il layout con `mat-sidenav-container` altera il bounding rect del bottone.

Fix: aggiungere `[overlapTrigger]="false"` al mat-menu e/o usare `yPosition="below"`.
In alternativa, fare il trigger button `position: relative` con stacking context corretto.

Investigare in `dashboard.html` e `dashboard.scss` la causa esatta.
Se il bottone è dentro un elemento con `overflow: hidden` o `transform`, questo può rompere
il positioning dell'overlay Material. Controlla il `.app-header` / `mat-toolbar` CSS.

## Fix 3 — Note ricorrenti mostrano testo PGP raw nella card

Lo screenshot mostra una nota nella sezione "Ricorrenti" con contenuto grezzo
`-----BEGIN PGP MESSAGE-----...` invece del testo decifrato.

Questo può succedere se:
a) La nota era salvata con chiave vecchia (problema dati, non codice — skip se è questo)
b) `getNotePreview()` in `dashboard.ts` riceve il blocco text con html cifrato e non decifra
c) Il servizio `getNotes()` non ha ancora decifrato le note quando vengono mostrate

**Verifica**: in `note.ts` → `getNotes()`, le note vengono decifrate prima di essere
emesse dall'observable? Se sì, il problema è (a) — dati test corrotti, non un bug di codice.
Se no, trovare dove la decifratura viene chiamata e assicurarsi che sia completata prima
che `allNotes` venga popolato in `dashboard.ts`.

Se la causa è (a), non servono modifiche al codice — segnalarlo nel completed.

## Output atteso
- Fix 1 + Fix 2 in `settings.component.html`, `dashboard.html`, `dashboard.scss`
- Fix 3: fix o conferma che è dati di test
- Build production OK
- Aggiorna questo file con `status: done` e `completed:`

## ⛔ NO deploy — attendo validazione Giuseppe in locale
completed: Fix1: settings.component.html "Interfaccia mobile" → "Vista di default". Fix2: dashboard.html mat-menu aggiunto [overlapTrigger]="false" — nessun overflow:hidden/transform su .app-header che giustifichi posizionamento errato, la causa più probabile è il calcolo del bounding rect col safe-area-inset-top. Fix3: getNotes() in note.ts decifra correttamente via cryptoService.decryptNote() prima di emettere — il PGP raw è caso (a): nota cifrata con chiave precedente al reset, non decifrabilecon la nuova chiave. Nessuna modifica al codice necessaria, eliminare la nota di test. Build OK.
