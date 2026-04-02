status: done
agent: alpha
task: Fix dashboard — authState emette null al primo tick → redirect loop al login
completed: dashboard.ts: aggiunto skip(1) alla pipe di user$, aggiunto skip all'import rxjs. Build production OK.

## Causa
In `dashboard.ts` `ngOnInit()`, la subscription a `authService.user$` fa redirect a /login quando riceve null.
Firebase `authState` emette sempre null al primo tick (prima di risolvere la sessione in cache),
poi emette l'utente. Questo causa un redirect immediato al login anche per utenti autenticati.

## Fix in `dashboard.ts`

Aggiungere `skip(1)` alla subscription — la authGuard ha già validato lo stato iniziale,
la subscription monitora solo i cambiamenti successivi:

### Prima:
```ts
this.authSub = this.authService.user$.subscribe(user => {
  if (!user) {
    this.router.navigate(['/login'], { replaceUrl: true });
  }
});
```

### Dopo:
```ts
import { skip } from 'rxjs';
// ...
this.authSub = this.authService.user$.pipe(skip(1)).subscribe(user => {
  if (!user) {
    this.router.navigate(['/login'], { replaceUrl: true });
  }
});
```

Verificare che `skip` sia importato da `rxjs` (aggiungere all'import esistente se necessario).

## Output atteso
- Fix in `dashboard.ts`
- Build production OK
- Aggiorna questo file con `status: done` e `completed:`
