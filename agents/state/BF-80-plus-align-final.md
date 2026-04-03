status: done
agent: alpha
task: Fix definitivo + Nuova nota — span flex dentro il button

## Problema
`::ng-deep .mdc-button__label` nel SCSS non allinea l'icona perché il selettore
non ha effetto nel contesto del componente. Il `+` resta disallineato.

## Fix in `dashboard.html`

Wrappare icona e testo in uno `<span>` con flex DENTRO il button — questo funziona
perché il layout flex è applicato al contenuto già dentro `.mdc-button__label`,
bypassando il problema di MDC:

```html
<!-- Prima -->
<button mat-flat-button color="primary" (click)="openNoteEditor()">
  <mat-icon>add</mat-icon>
  Nuova nota
</button>

<!-- Dopo -->
<button mat-flat-button color="primary" (click)="openNoteEditor()">
  <span style="display:flex;align-items:center;gap:6px">
    <mat-icon style="font-size:18px;width:18px;height:18px;line-height:18px">add</mat-icon>
    <span>Nuova nota</span>
  </span>
</button>
```

## Rimuovere da `dashboard.scss`
Nel blocco `.empty-state button`: rimuovere il `::ng-deep .mdc-button__label { ... }` aggiunto
da BF-77 (non funziona) e i relativi stili del `mat-icon` che conflittano.
Mantenere solo `border-radius`.

## Output atteso
- Fix in `dashboard.html` e `dashboard.scss`
- Build production OK
- Aggiorna questo file con `status: done` e `completed:`

## ⛔ NO deploy — attendo validazione Giuseppe in locale
completed: dashboard.html: span flex wrapper su icona+testo nel button empty-state; dashboard.scss .empty-state button: rimossi mat-icon styles e ::ng-deep .mdc-button__label, mantenuto solo border-radius. Build OK.
