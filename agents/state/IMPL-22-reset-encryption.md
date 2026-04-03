status: done
agent: alpha
task: Pagina impostazioni — voce "Reset chiave di cifratura"

## Obiettivo

Aggiungere nella pagina `/settings` una sezione per il reset completo della chiave di cifratura E2E.
Operazione irreversibile: cancella tutte le note e ripristina lo stato di nuovo utente.

## Flusso

1. Utente tappa "Reset chiave di cifratura" in impostazioni
2. Modale di conferma con warning forte (testo rosso, icona warning)
3. Utente conferma → esecuzione:
   a. Cancella tutte le note Firestore dove `uid == currentUser.uid`
   b. Cancella chiave privata locale da localStorage
   c. Resetta su `users/{uid}`: `encryptionEnabled: false`, `encryptionSetup: false`, `publicKey: deleteField()`
   d. Redirect a `/dashboard` → `initEncryption()` rileva utente senza setup → mostra dialog setup chiave
4. Utente annulla → chiude modale, nessuna azione

## Implementazione in `settings.component.ts`

### Dipendenze da iniettare
- `AuthService` — per ottenere uid corrente
- `Router` — per redirect post-reset
- Firestore (via `getFirestore`) — per cancellare note e aggiornare user doc
- `CryptoService` — per cancellare la chiave locale (verificare quale metodo espone per il cleanup)

### Metodo `resetEncryption()`

```typescript
async resetEncryption(): Promise<void> {
  const uid = this.authService.getCurrentUserId();
  if (!uid) return;

  const db = getFirestore();

  // 1. Cancella tutte le note dell'utente
  const notesQuery = query(collection(db, 'notes'), where('uid', '==', uid));
  const notesSnap = await getDocs(notesQuery);
  const deletions = notesSnap.docs.map(d => deleteDoc(d.ref));
  await Promise.all(deletions);

  // 2. Cancella chiave privata locale
  this.cryptoService.clearLocalPrivateKey(uid); // o metodo equivalente — verifica il nome

  // 3. Resetta campi encryption su Firestore
  const userRef = doc(db, `users/${uid}`);
  await updateDoc(userRef, {
    encryptionEnabled: false,
    encryptionSetup: false,
    publicKey: deleteField()
  });

  // 4. Redirect al dashboard → setup dialog si ri-mostra automaticamente
  this.router.navigate(['/dashboard'], { replaceUrl: true });
}
```

### Modale di conferma

Usare `ConfirmDialogComponent` già presente nel progetto (introdotto in IMPL-21).
Configurazione:
- Titolo: "Reset chiave di cifratura"
- Testo: "Questa operazione eliminerà **tutte le tue note** e resetterà la chiave di cifratura. Non è possibile recuperare i dati. Sei sicuro di voler continuare?"
- Bottone conferma: "Elimina tutto e resetta" — colore `warn` (rosso Material)
- Bottone annulla: "Annulla"

## UI in `settings.component.html`

Aggiungere una nuova sezione in fondo alla pagina, separata da `mat-divider`, con tono visivo di "zona pericolosa":

```html
<mat-divider></mat-divider>

<section class="danger-zone">
  <h3>Zona pericolosa</h3>
  <p>Il reset elimina tutte le note e ti permette di impostare una nuova chiave di cifratura.</p>
  <button mat-stroked-button color="warn" (click)="confirmResetEncryption()">
    <mat-icon>lock_reset</mat-icon>
    Reset chiave di cifratura
  </button>
</section>
```

## Note implementative
- Leggere `crypto.service.ts` per trovare il metodo corretto per cancellare la chiave locale
- Leggere `settings.component.ts` per verificare quali servizi sono già iniettati
- Verificare che `ConfirmDialogComponent` sia già importato in `settings.component.ts`
- Se non esiste un `ConfirmDialogComponent`, usare `MatDialog` con un dialogo inline
- Usare `impeccable:harden` per gestione edge case (utente offline, errore Firestore, ecc.)

## Output atteso
- Fix in `settings.component.ts`, `settings.component.html`, `settings.component.scss`
- Build production OK
- Aggiorna questo file con `status: done` e `completed:`

## ⛔ NO deploy — attendo validazione Giuseppe in locale
completed: settings.component.ts: iniettati AuthService, CryptoService, MatSnackBar; resetInProgress flag; guard offline; ordine operazioni sicuro (note → userDoc → chiave locale → redirect); snackBar su errore. HTML: sezione danger-zone con spinner inline e button disabilitato durante reset. SCSS: stili danger-zone.
