status: done
agent: alpha
task: Fix registrazione — E2E setup non mostrato + verifica email obbligatoria
completed: dashboard.ts: showSetupDialog() per nuovo utente senza userDoc/localKey. auth.ts: aggiunto sendVerificationEmail(). login.ts: dopo register → sendVerificationEmail + logout + successMessage. auth.guard.ts: blocca email provider non verificati. Build production OK.

---

## Bug 1 — E2E setup non mostrato ai nuovi utenti

### Causa
`dashboard.ts` `initEncryption()`: se `getUserDoc()` ritorna null (nessun documento `users/{uid}` per utente nuovo), fa return silenzioso senza mostrare il dialog di setup.

### Fix in `dashboard.ts` — `initEncryption()`

Sostituire:
```ts
if (!userDoc) {
  const localKey = this.cryptoService.getLocalPrivateKey(uid);
  if (localKey) {
    console.warn('[Encryption] UserDoc non disponibile offline, cifratura disabilitata per questa sessione');
  }
  return;
}
```

Con:
```ts
if (!userDoc) {
  const localKey = this.cryptoService.getLocalPrivateKey(uid);
  if (localKey) {
    console.warn('[Encryption] UserDoc non disponibile offline, cifratura disabilitata per questa sessione');
    return;
  }
  // Nessun documento e nessuna chiave locale → nuovo utente, mostra setup
  await this.showSetupDialog(uid);
  return;
}
```

---

## Bug 2 — Verifica email obbligatoria (anti-bot)

### Fix in `auth.ts`

Aggiungere metodo:
```ts
sendVerificationEmail() {
  const user = this.auth.currentUser;
  if (!user) return Promise.resolve();
  return sendEmailVerification(user);
}
```

Aggiungere `sendEmailVerification` agli import da `@angular/fire/auth`.

### Fix in `login.ts` — dopo la registrazione

Sostituire il blocco register in `onSubmit()`:
```ts
if (this.isRegistering) {
  if (this.password !== this.confirmPassword) return;
  await this.authService.register(this.email, this.password);
  await this.authService.sendVerificationEmail();
  await this.authService.logout();
  this.isRegistering = false;
  this.successMessage = 'Account creato! Controlla la tua email per verificare l\'account, poi accedi.';
  return; // non navigare al dashboard
}
```

### Fix in `auth.guard.ts`

Bloccare l'accesso se l'utente non ha verificato l'email (solo per provider email/password, non Apple):

```ts
return authService.user$.pipe(
  take(1),
  map(user => {
    if (!user) {
      router.navigate(['/login']);
      return false;
    }
    const isEmailProvider = user.providerData.some(p => p.providerId === 'password');
    if (isEmailProvider && !user.emailVerified) {
      router.navigate(['/login']);
      return false;
    }
    return true;
  })
);
```

---

## Output atteso
- Fix in `dashboard.ts`, `auth.ts`, `login.ts`, `auth.guard.ts`
- Build production OK
- Aggiorna questo file con `status: done` e `completed:`
