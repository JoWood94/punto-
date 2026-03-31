# punto!

Un'app per prendere appunti. Mobile-first, installabile come PWA, sincronizzata su cloud.

Niente di più. Niente di meno.

---

## Cosa fa

- Scrivi note con testo ricco, checklist, link e indirizzi
- Imposta un promemoria: ricevi una notifica push alla data e ora scelta
- Le note si sincronizzano in tempo reale su tutti i tuoi dispositivi
- Funziona offline, si aggiorna quando torni online
- Installabile su iOS e Android come app nativa (PWA)

## Come si usa

Apri il browser sul telefono, vai all'indirizzo, aggiungi alla schermata home. Fatto.

Su desktop funziona lo stesso, ma è progettata per il pollice.

---

## Stack

- Angular 21 + Angular Material M3
- Firebase (Auth, Firestore, Cloud Messaging)
- GitHub Actions per il deploy su GitHub Pages
- Node.js cron su GitHub Actions per le notifiche push

## Sviluppo locale

```bash
cd frontend
npm install
npm start   # https://localhost:4200
```

## Deploy

Ogni push su `main` triggera il build e il deploy automatico su GitHub Pages.

```bash
ng build --configuration production --base-href /punto-/
```
