status: done
agent: alpha
task: Fix E2E — Invalid user ID format in openpgp.generateKey()
completed: crypto.ts riga 43: sostituito `email: uid` con `name: uid`. Build production OK.

## Root cause

`frontend/src/app/services/crypto.ts` riga 43:
```ts
userIDs: [{ email: uid }],
```

OpenPGP.js richiede che il campo `email` sia un indirizzo email valido (formato `name@domain.com`).
Il Firebase UID (es. `W42XL7UVYFRMakpZJdrpcGkgsQr1`) non lo è → `Invalid user ID format` → keypair mai generata.

## Fix — una riga sola

Sostituire `email` con `name`:

```ts
userIDs: [{ name: uid }],
```

OpenPGP.js accetta user ID con solo `name` (senza email). Nessun'altra modifica.

## Output atteso
- Fix applicato in `crypto.ts` riga 43
- Build production OK
- Aggiorna questo file con `status: done` e `completed:`
