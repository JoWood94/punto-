status: done
agent: alpha
task: Fix E2E — sessionVersion confrontata DOPO il salvataggio, logout mai triggerato
completed: Aggiunto check esplicito in initEncryption() PRIMA della registrazione del watchUserDoc listener — legge localVersion/remoteVersion, logout immediato se divergono. Build production OK.

## Root cause (già analizzata dal Team Lead)

In `dashboard.ts`, `initEncryption()`:
1. Legge `remoteSessionVersion` da Firestore (via `getUserDoc()`)
2. Chiama `cryptoService.saveLocalSessionVersion(uid, remoteSessionVersion)` — sovrascrive il valore locale
3. Solo DOPO registra `watchUserDoc` listener
4. Quando il listener fa il primo callback, locale == remoto → nessun logout

**Il confronto avviene sempre su valori già allineati.**

Questo spiega perché il bug persiste anche alla riapertura della tab/PWA: `initEncryption()` gira ad ogni mount e allinea sempre prima di controllare.

## Fix da applicare in `frontend/src/app/components/dashboard/dashboard.ts`

In `initEncryption()`, PRIMA di chiamare `saveLocalSessionVersion`:

1. Leggi la sessionVersion locale esistente:
   ```ts
   const localVersion = this.cryptoService.getLocalSessionVersion(uid);
   const remoteVersion = userDoc['sessionVersion'] as number | undefined;
   ```

2. Se `localVersion` esiste (non null) E diverge da `remoteVersion` → logout immediato:
   ```ts
   if (localVersion !== null && remoteVersion !== undefined && localVersion !== remoteVersion) {
     this.userDocUnsub?.();
     await this.authService.logout();
     this.router.navigate(['/login']);
     return;
   }
   ```

3. Solo se i valori coincidono (o local è null = primo accesso) → `saveLocalSessionVersion` e procedi normalmente.

**Nessuna altra modifica necessaria.** Il `watchUserDoc` listener rimane per coprire il caso in cui la passphrase cambia mentre la tab è già aperta.

## Output atteso
- Fix applicato in `dashboard.ts` — `initEncryption()` esegue il check PRIMA del salvataggio
- Build production OK
- Aggiorna questo file con `status: done` e `completed:`
