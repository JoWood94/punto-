status: done
agent: alpha
task: Fix FCM token accumulation — sostituire arrayUnion con gestione token per dispositivo

## Problema

`push-notification.ts` usa `arrayUnion(token)` per salvare il token FCM in Firestore.
Ogni volta che l'app si registra (refresh, reinstall, nuovo browser) aggiunge un nuovo token senza rimuovere il vecchio. L'utente ha accumulato 37 token → GHA manda la notifica a tutti → notifiche duplicate.

## Fix in `push-notification.ts`

### Logica corretta
Al momento della registrazione:
1. Ottieni il nuovo token FCM
2. Leggi i token esistenti da Firestore (`users/{uid}.fcmTokens`)
3. Controlla se il token è già presente → se sì, non fare nulla
4. Se non è presente → aggiungi il nuovo token e rimuovi eventuali token scaduti/invalidi

Ma il problema vero è che non c'è modo di sapere quali token sono "vecchi" di questo dispositivo. La soluzione più robusta: **mantenere max N token recenti** (es. 5), rimuovendo i più vecchi quando si aggiunge uno nuovo.

### Implementazione

In `push-notification.ts`, nel metodo che salva il token (probabilmente `requestPermission()` o simile), sostituire:

```typescript
// PRIMA (accumula infinitamente):
await updateDoc(userRef, {
  fcmTokens: arrayUnion(token)
});
```

Con:

```typescript
// DOPO (mantiene max 5 token, rimuove i più vecchi):
const userSnap = await getDoc(userRef);
const existing: string[] = userSnap.exists() ? (userSnap.data()['fcmTokens'] ?? []) : [];

if (!existing.includes(token)) {
  // Aggiungi nuovo token, mantieni al massimo 5 (gli ultimi 4 + il nuovo)
  const updated = [...existing, token].slice(-5);
  await setDoc(userRef, { fcmTokens: updated }, { merge: true });
}
```

### Nota
- Leggi prima il file per trovare il metodo esatto che chiama `arrayUnion`
- `slice(-5)` mantiene gli ultimi 5 token → se un utente ha browser vecchi, i loro token escono naturalmente
- Il server già rimuove token invalidi (error `registration-token-not-registered`) → i 5 slot vengono liberati automaticamente nel tempo
- NON usare `setDoc` senza `merge: true` — sovrascriveresti altri campi del documento utente

## Output atteso
- Fix in `push-notification.ts`
- Build production OK
- Aggiorna questo file con `status: done` e `completed:`

## ⛔ NO deploy — attendo validazione Giuseppe in locale
completed: push-notification.ts: arrayUnion rimosso; ora legge fcmTokens esistenti, salta se token già presente, altrimenti scrive slice(-5). Import aggiornato (getDoc al posto di arrayUnion).
