status: done
agent: alpha
task: Session check periodico in dashboard — authState subscription + reload ogni 5 min
completed: dashboard.ts: aggiunti authSub/sessionCheckInterval, subscription user$ post-initEncryption, setInterval 5min con reloadUser(), cleanup in ngOnDestroy(). auth.ts: aggiunto reloadUser(). Build production OK.

## Obiettivo
Rilevare sessioni scadute/revocate/account eliminati mentre la tab è già aperta.

## Fix in `dashboard.ts`

### 1. Aggiungere proprietà private
```ts
private authSub?: Subscription;
private sessionCheckInterval?: ReturnType<typeof setInterval>;
```

### 2. In `ngOnInit()` — dopo `initEncryption()`

Sottoscrivi `authService.user$` per redirect immediato se sessione scade:
```ts
this.authSub = this.authService.user$.subscribe(user => {
  if (!user) {
    this.router.navigate(['/login'], { replaceUrl: true });
  }
});
```

Avvia check periodico ogni 5 minuti:
```ts
this.sessionCheckInterval = setInterval(async () => {
  try {
    await this.authService.reloadUser();
  } catch {
    // Token revocato o account eliminato → authState emetterà null → redirect automatico
  }
}, 5 * 60 * 1000);
```

### 3. In `ngOnDestroy()` — aggiungere cleanup
```ts
this.authSub?.unsubscribe();
clearInterval(this.sessionCheckInterval);
```

## Fix in `auth.ts`

Aggiungere metodo `reloadUser()`:
```ts
async reloadUser(): Promise<void> {
  const user = this.auth.currentUser;
  if (user) await user.reload();
}
```

## Note
- `Subscription` va importato da `rxjs` (verificare se già presente)
- Non aggiungere import duplicati
- `user.reload()` forza un round-trip con Firebase → rileva account disabilitati, eliminati, token revocati
- Se `reload()` lancia errore (token non valido) → il catch è silenzioso, ma `authState` emetterà null automaticamente → redirect gestito dalla subscription

## Output atteso
- Fix in `dashboard.ts` e `auth.ts`
- Build production OK
- Aggiorna questo file con `status: done` e `completed:`
