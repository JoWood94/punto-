status: done
agent: alpha
task: Fix login — nessun messaggio di errore UI + fix feedback password recovery
completed: login.ts: aggiunti errorMessage/successMessage, getErrorMessage(), reset prima di ogni try. login.html: aggiunto blocco error/success prima di .secondary-actions. login.scss: stili .error-message e .success-message. Build production OK.

## Problema

`login.ts`: tutti i catch fanno solo `console.error()`. L'utente non vede nulla quando:
- Credenziali errate
- Email non trovata
- Password recovery inviata con successo
- Qualsiasi altro errore Firebase

## Fix in `login.ts`

Aggiungere:
```ts
errorMessage = '';
successMessage = '';
```

In `onSubmit()`, sostituire il catch:
```ts
} catch (error: any) {
  this.errorMessage = this.getErrorMessage(error.code);
}
```

In `recoverPassword()`, sostituire il catch e aggiungere il success:
```ts
await this.authService.resetPassword(this.email);
this.successMessage = 'Email di recupero inviata. Controlla la tua casella.';
this.isRecoveringPassword = false;
// nel catch:
this.errorMessage = this.getErrorMessage(error.code);
```

Aggiungere metodo helper privato:
```ts
private getErrorMessage(code: string): string {
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Email o password non corretti.';
    case 'auth/email-already-in-use':
      return 'Email già registrata. Prova ad accedere.';
    case 'auth/weak-password':
      return 'Password troppo corta (minimo 6 caratteri).';
    case 'auth/invalid-email':
      return 'Indirizzo email non valido.';
    case 'auth/too-many-requests':
      return 'Troppi tentativi. Riprova tra qualche minuto.';
    default:
      return 'Si è verificato un errore. Riprova.';
  }
}
```

Resettare `errorMessage` e `successMessage` a '' all'inizio di ogni metodo (prima del try).

## Fix in `login.html`

Aggiungere dopo il form, prima di `.secondary-actions`:
```html
<p class="error-message" *ngIf="errorMessage">{{ errorMessage }}</p>
<p class="success-message" *ngIf="successMessage">{{ successMessage }}</p>
```

## Fix in `login.scss`

Aggiungere stili minimi:
```scss
.error-message {
  color: var(--mat-sys-error, #b00020);
  font-size: 0.85rem;
  margin: 4px 0 8px;
  text-align: center;
}
.success-message {
  color: #2e7d32;
  font-size: 0.85rem;
  margin: 4px 0 8px;
  text-align: center;
}
```

## Output atteso
- Fix in `login.ts`, `login.html`, `login.scss`
- Build production OK
- Aggiorna questo file con `status: done` e `completed:`
