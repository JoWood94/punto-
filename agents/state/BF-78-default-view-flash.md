status: done
agent: alpha
task: Fix flash calendario su mobile — currentMainView default sbagliato

## Causa
`dashboard.ts` riga 74: `currentMainView: 'list' | 'calendar' = 'calendar';`

Il valore iniziale è 'calendar'. Prima che `ngOnInit` carichi la preferenza utente
(riga 152, chiamata async), il template mostra già il calendario perché:
- `dashboard.html` riga 246: `*ngIf="currentMainView === 'calendar'"` — non dipende da `isReady`

Risultato: su mobile con defaultView='list', si vede il calendario per ~200ms prima che la preferenza
venga letta e `currentMainView` diventi 'list'.

## Fix in `dashboard.ts`

Cambiare il valore iniziale da 'calendar' a 'list':

```typescript
// Prima:
currentMainView: 'list' | 'calendar' = 'calendar';

// Dopo:
currentMainView: 'list' | 'calendar' = 'list';
```

Questo garantisce che al primo render su mobile si veda la lista (con `isReady = false`
che blocca il contenuto finché la preferenza non è caricata), e poi si switcherà al calendario
solo se la preferenza lo richiede.

Nota: se la preferenza è 'calendar', ci sarà un brevissimo flash inverso (lista → calendario),
ma è meno impattante del calendario che si vede sempre prima. Accettabile.

## Output atteso
- Fix in `dashboard.ts`
- Build production OK
- Aggiorna questo file con `status: done` e `completed:`

## ⛔ NO deploy — attendo validazione Giuseppe in locale
completed: dashboard.ts: currentMainView = 'list' (era 'calendar') — elimina il flash del calendario su mobile prima del caricamento della preferenza utente. Build OK.
