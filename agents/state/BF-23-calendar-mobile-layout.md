status: done
agent: alpha
task: Fix calendario vista mese mobile — layout rotto + scroll verticale

## Bug

Su mobile la vista mese del calendario ha il layout rotto (celle compresse/overflow) e non è scrollabile.

## Causa probabile

`calendar-view.component.scss`:
- `.calendar-view` ha `overflow: hidden` e `height: 100%` — blocca lo scroll
- `.month-grid` usa `grid` con righe a altezza fissa che non si adattano allo schermo mobile

## Fix

Su mobile (max-width: 768px o breakpoint equivalente):

1. **Scroll verticale**: `.calendar-view` deve avere `overflow-y: auto` invece di `overflow: hidden`. Il container padre (`.calendar-wrapper` in dashboard) deve permettere lo scroll.

2. **Griglia mese scrollabile**: `.month-view` e `.month-grid` non devono avere `height` fissa — devono crescere in base al contenuto. Rimuovere `height: 100%` e `overflow: hidden` dalla chain su mobile.

3. **Celle giorno**: su mobile le celle `.day-cell` possono essere più compatte in altezza (min-height ridotto), ma devono restare leggibili. I chip note possono essere nascosti o limitati a 1 per non spaccare il layout.

4. **Header calendario**: su mobile `calendar-header` con `flex-wrap: wrap` va bene ma verificare che non si sovrapponga al contenuto.

L'obiettivo: su mobile la vista mese mostra la griglia completa del mese, scrollabile verticalmente, con celle proporzionate allo schermo.

## ⛔ NO deploy — attendo validazione Giuseppe in locale
completed: Strategia "crescita naturale + scroll sul wrapper". calendar-view.component.scss mobile: :host height:auto/min-height:100%, .calendar-view overflow:visible/height:auto, .month-view overflow:visible/flex:none, .month-grid grid-auto-rows:minmax(52px,auto) (era minmax(80px,1fr) — causa root del bug), .day-cell min-height:52px, chip limitati a 1 con nth-child(n+2){display:none}. dashboard.scss: .calendar-wrapper @media mobile → overflow-y:auto per scrollare il contenuto cresciuto.
bloccato_da:
