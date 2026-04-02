status: done
agent: alpha
task: Fix calendario — host component deve essere flex per riempire il container

## Problema

`app-calendar-view` è figlio di `calendar-wrapper` che è un flex container (`display: flex; flex-direction: column`). Il `:host` attuale ha `display: block; height: 100%` — in un flex container `height: 100%` non è sufficiente da solo, serve `flex: 1` per occupare lo spazio disponibile. Senza questo, la catena di altezze si rompe e `months-scroll-container { flex: 1 }` non ha altezza su cui espandersi.

## Fix in calendar-view.component.scss — blocco mobile (@media max-width: 599.98px)

```scss
:host {
  display: flex;
  flex-direction: column;
  flex: 1;         // riempie calendar-wrapper (flex container)
  min-height: 0;   // fondamentale per flex annidati: permette al figlio di shrinkare
  overflow: hidden;
}

.calendar-view {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
```

## Fix anche nel base (fuori dal media query) — desktop

Verificare che il `:host` base abbia `height: 100%` e che `calendar-view` base abbia `height: 100%` — questo non va toccato, è già corretto per desktop. La modifica sopra è SOLO nel blocco `@media (max-width: 599.98px)`.

## ⛔ NO deploy — attendo validazione Giuseppe in locale
completed: calendar-view.component.scss mobile: :host → display:flex/flex-direction:column/flex:1/min-height:0/overflow:hidden. .calendar-view → stessi valori. La catena flex è ora completa: dashboard-content → calendar-wrapper → :host → calendar-view → months-scroll-container.
bloccato_da:
