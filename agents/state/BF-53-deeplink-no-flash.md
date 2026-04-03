status: done
agent: alpha
task: Fix deep link — eliminare flash lista note prima di navigare alla nota

## Problema

Quando l'utente arriva da una notifica push, l'app mostra per un attimo la lista note (dashboard home) prima di aprire l'editor della nota. Succede perché:
1. Angular renderizza il dashboard immediatamente
2. `checkNavigationQueue()` è async → `deepLinkNoteId` viene settato con un tick di ritardo
3. Le note arrivano da Firestore con ulteriore ritardo
4. Solo allora `selectNote()` viene chiamato → editor visibile

## Fix

### 1. `dashboard.ts` — aggiungere flag `hasDeepLink`

Aggiungere proprietà:
```typescript
hasDeepLink = false;
```

In `ngOnInit()`, subito dopo aver settato `deepLinkNoteId`:
```typescript
const urlParams = new URLSearchParams(window.location.search);
this.deepLinkNoteId = urlParams.get('openNote') || await this.checkNavigationQueue();
this.hasDeepLink = !!this.deepLinkNoteId;
```

Nel `notesSub` subscriber, dopo `selectNote()`, resettare il flag:
```typescript
if (this.deepLinkNoteId) {
  const target = notes.find(n => n.id === this.deepLinkNoteId);
  if (target) {
    this.selectNote(target);
    this.deepLinkNoteId = null;
    this.hasDeepLink = false;
  }
}
```

### 2. `dashboard.html` — bloccare rendering lista se hasDeepLink

Trovare il contenitore principale della lista note (il tag che wrappa la nota list / main content area) e aggiungere la condizione. Cerca il blocco che contiene `*ngFor` sulle note o la main view area.

Se esiste già un blocco `*ngIf` per `notesLoaded` o simile, estenderlo:
```html
<!-- Prima -->
<div *ngIf="notesLoaded">...</div>

<!-- Dopo -->
<div *ngIf="notesLoaded && !hasDeepLink">...</div>
```

Se non esiste un singolo wrapper, wrappare il contenuto principale in:
```html
<ng-container *ngIf="!hasDeepLink; else deepLinkLoading">
  <!-- contenuto lista/dashboard esistente -->
</ng-container>

<ng-template #deepLinkLoading>
  <!-- schermo neutro: blank o mat-spinner centrato -->
  <div style="display:flex; align-items:center; justify-content:center; height:100%;">
    <mat-spinner diameter="32"></mat-spinner>
  </div>
</ng-template>
```

Il `mat-spinner` è già disponibile (Angular Material è già importato nel progetto).

## Note
- `hasDeepLink` viene resettato a `false` non appena `selectNote()` viene chiamato → nessun blocco permanente
- Se la nota non viene trovata nelle note (es. nota eliminata), `hasDeepLink` resterebbe `true` per sempre → aggiungere un fallback: se `notesLoaded && deepLinkNoteId && !notes.find(...)` → resetta entrambi i flag e mostra la lista normalmente
- Leggere `dashboard.html` prima di applicare il fix per trovare la struttura corretta

## Output atteso
- Fix in `dashboard.ts` e `dashboard.html`
- Build production OK
- Aggiorna questo file con `status: done` e `completed:`

## ⛔ NO deploy — attendo validazione Giuseppe in locale
completed: dashboard.ts: hasDeepLink flag aggiunto, settato dopo checkNavigationQueue(), resettato in notesSub (sia nota trovata che non trovata). dashboard.html: spinner visibile anche con hasDeepLink=true, lista nascosta finché hasDeepLink.
