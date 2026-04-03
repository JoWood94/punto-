status: done
agent: alpha
task: Fix flash calendario deeplink — hasDeepLink = true di default

## Problema
`hasDeepLink` parte da `false`. I pochi ms prima che `checkNavigationQueue()` risolva,
Angular renderizza il dashboard con il default view (calendario) → flash visibile prima della nota.

## Fix in `dashboard.ts`

Una sola riga da cambiare:

### Prima:
```typescript
hasDeepLink = false;
```

### Dopo:
```typescript
hasDeepLink = true;
```

La logica esistente in `ngOnInit()` già imposta `this.hasDeepLink = !!this.deepLinkNoteId`
dopo il check — quindi su aperture normali (nessun deeplink) diventa `false` in < 10ms.
Nessuna altra modifica necessaria.

## Output atteso
- Fix in `dashboard.ts` (1 riga)
- Build production OK
- Aggiorna questo file con `status: done` e `completed:`

## ⛔ NO deploy — attendo validazione Giuseppe in locale
completed: dashboard.ts: hasDeepLink = true di default. Nessun'altra modifica.
