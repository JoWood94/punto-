status: done
agent: alpha
task: Fix flash contenuto dashboard — flag isReady aspetta tutti gli init async

## Problema

Il dashboard renderizza contenuto parziale mentre gli init async non sono ancora completati:
1. `checkNavigationQueue()` — async, pochi ms
2. `getUserPreference()` per la vista di default — async, legge localStorage/Firestore

Risultato: l'utente vede un flash di calendario (o vista sbagliata) prima che la preferenza venga applicata.

## Fix in `dashboard.ts`

### 1. Rinominare/rimpiazzare `hasDeepLink` con `isReady`

Rimuovere la proprietà `hasDeepLink` e sostituirla con `isReady`:

```typescript
// PRIMA:
hasDeepLink = true;

// DOPO:
isReady = false;
```

### 2. In `ngOnInit()` — impostare `isReady = true` solo dopo tutti gli init

```typescript
async ngOnInit() {
  // ... codice esistente invariato fino a qui ...

  // Deep link + navigation queue
  const urlParams = new URLSearchParams(window.location.search);
  this.deepLinkNoteId = urlParams.get('openNote') || await this.checkNavigationQueue();

  // Preferenza vista di default (solo mobile)
  if (this.isMobile) {
    this.currentMainView = await this.noteService.getUserPreference<'list' | 'calendar'>(this.defaultViewKey, 'list');
  }

  // Solo ORA tutto è pronto — mostra il contenuto
  this.isReady = true;

  // ... resto del codice invariato (notes$, authSub, ecc.) ...
}
```

### 3. In `notesSub` — aggiornare i riferimenti a `hasDeepLink`

Sostituire tutti i riferimenti a `hasDeepLink` con i riferimenti corretti:
- Dove si resetta `hasDeepLink = false` → non serve più (isReady non viene mai rimesso a false)
- Il deeplink viene gestito tramite `deepLinkNoteId` che resta invariato

### 4. In `dashboard.html` — aggiornare la condizione

Trovare tutti i punti dove è usato `hasDeepLink` e sostituire con `!isReady`:

```html
<!-- PRIMA -->
<ng-container *ngIf="!hasDeepLink; else deepLinkLoading">

<!-- DOPO -->
<ng-container *ngIf="isReady; else loadingState">
```

Il template `#loadingState` mostra lo spinner (già esistente come `#deepLinkLoading` o simile).

## Note
- `isReady` parte da `false` → spinner mostrato subito, zero flash
- Diventa `true` solo dopo nav queue check + preferenza vista caricata
- Per aperture normali (nessun deeplink, preferenza in localStorage) il delay è < 5ms — impercettibile
- `deepLinkNoteId` e la logica di apertura nota rimangono invariati
- Leggere dashboard.ts e dashboard.html prima di applicare per trovare i punti esatti

## Output atteso
- Fix in `dashboard.ts` e `dashboard.html`
- Build production OK
- Aggiorna questo file con `status: done` e `completed:`

## ⛔ NO deploy — attendo validazione Giuseppe in locale
completed: dashboard.ts: hasDeepLink → isReady=false; isReady=true dopo getUserPreference; rimossi i due reset hasDeepLink in notesSub. dashboard.html: condizioni aggiornate a isReady/!isReady.
