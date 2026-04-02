status: done
agent: alpha
task: Aggiungere loader — login, lista note, inizializzazione dashboard
completed: login.ts: isLoading + finally + MatProgressSpinnerModule. login.html: bottone con spinner/testo contestuale. dashboard.ts: notesLoaded + MatProgressSpinnerModule. dashboard.html: loader + ng-container notesLoaded. dashboard.scss: .notes-loading. Build production OK.

## Colore
`color="primary"` su tutti i `mat-spinner` — il primary è già `#1C1B1F` (nero) nell'app.

---

## 1. Login — `login.ts` + `login.html`

### login.ts
Aggiungere `isLoading = false`.
In ogni metodo asincrono, settare `isLoading = true` prima del try e `false` nel finally:

```ts
async onSubmit() {
  if (!this.email || !this.password) return;
  this.errorMessage = '';
  this.successMessage = '';
  this.isLoading = true;
  try {
    // ... codice esistente ...
  } catch (error: any) {
    this.errorMessage = this.getErrorMessage(error.code);
  } finally {
    this.isLoading = false;
  }
}

async recoverPassword() {
  if (!this.email) return;
  this.errorMessage = '';
  this.successMessage = '';
  this.isLoading = true;
  try {
    // ... codice esistente ...
  } finally {
    this.isLoading = false;
  }
}
```

### login.html
Aggiungere `MatProgressSpinnerModule` agli imports del componente.
Modificare il bottone submit per mostrare spinner e disabilitarlo durante il caricamento:

```html
<button mat-flat-button type="submit" class="submit-btn"
        [disabled]="isLoading || (isRecoveringPassword ? !email : (!email || !password))">
  <mat-spinner *ngIf="isLoading" diameter="20" color="primary" style="display:inline-block;margin-right:8px;vertical-align:middle;"></mat-spinner>
  <span *ngIf="!isLoading">{{ isRecoveringPassword ? 'Invia Link di Recupero' : (isRegistering ? 'Registrati' : 'Accedi') }}</span>
  <span *ngIf="isLoading">{{ isRecoveringPassword ? 'Invio...' : (isRegistering ? 'Registrazione...' : 'Accesso...') }}</span>
</button>
```

---

## 2. Dashboard — lista note

### dashboard.ts
Aggiungere `notesLoaded = false`.
Nel `notesSub`, alla prima emissione settare `notesLoaded = true`:

```ts
this.notesSub = this.notes$.subscribe(notes => {
  this.notesLoaded = true;
  // ... codice esistente ...
});
```

### dashboard.html
Nella sezione `.notes-list`, aggiungere sopra il contenuto esistente:

```html
<!-- Loader lista note -->
<div *ngIf="!notesLoaded" class="notes-loading">
  <mat-spinner diameter="32" color="primary"></mat-spinner>
</div>

<!-- Contenuto esistente — mostra solo quando caricato -->
<ng-container *ngIf="notesLoaded">
  <!-- tutto il contenuto attuale della notes-list (pinned, unpinnedNotes, empty-state) -->
</ng-container>
```

### dashboard.scss
Aggiungere:
```scss
.notes-loading {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 48px 0;
}
```

---

## Import necessari
- `login.ts`: aggiungere `MatProgressSpinnerModule` agli `imports` del componente
- `dashboard.ts`: aggiungere `MatProgressSpinnerModule` agli `imports` del componente (verificare se già presente)

## Output atteso
- Fix in `login.ts`, `login.html`, `dashboard.ts`, `dashboard.html`, `dashboard.scss`
- Build production OK
- Aggiorna questo file con `status: done` e `completed:`
