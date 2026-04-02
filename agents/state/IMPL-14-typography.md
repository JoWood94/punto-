status: done
agent: alpha
task: Sostituire Roboto con typeface distintivo — proposta varianti poi implementazione ovunque

## Contesto

Roboto è la fingerprint più chiara di un progetto Angular di default. Il prodotto ha bisogno di un typeface con personalità ma leggibile.

## Skill da usare

Prima di implementare, usa `/typeset` per guidare le scelte tipografiche.

## Cosa fare

1. Usa `/typeset` per analizzare e proporre 2-3 varianti di type pair (es. DM Sans, Plus Jakarta Sans, Geist)
2. Implementa la variante migliore ovunque: UI text, heading, title input dell'editor
3. Sostituire in: `styles.scss`, `angular.json` (Google Fonts o font locali), tutti i componenti che sovrascrivono font-family

## Vincoli

- Deve rimanere leggibile su mobile a 14-16px
- Il typeface deve differenziarsi da Roboto senza essere eccentrico (riferimento: Things 3, Bear app)
- Applicare ovunque — nessun componente deve restare su Roboto

## ⛔ NO deploy — attendo validazione Giuseppe in locale
completed: Scelto Plus Jakarta Sans (400/500/600) — geometrico con calore umanista, editoriale, adatto a Things 3 / Bear. Sostituito Roboto in: index.html (Google Fonts link), styles.scss (font-family su html/body + typography in mat.theme() + --punto-font CSS var). Nessun override nei componenti — tutto eredita dal globale. angular.json non toccato (font via CDN, non asset locale).
bloccato_da:
