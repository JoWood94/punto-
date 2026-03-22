# punto! ⚪️

**punto!** è un'applicazione web mobile-first per la presa di appunti intelligente, caratterizzata da un'estetica minimale "Material You". 
Concepita per l'immediatezza, l'app offre un design pulito basato su una palette bi-tono (grigio chiaro su bianco sporco) che cattura i colori del brand.

## ✨ Funzionalità
- **Sincronizzazione Cloud in tempo reale:** Alimentato in modo serverless da Firebase (Auth, Firestore).
- **Notifiche Push (PWA):** Imposta un promemoria (data e ora) e ricevi una notifica push nativa tramite Firebase Cloud Messaging.
- **Geolocalizzazione:** Inserisci un indirizzo o un luogo e aprilo al volo su OpenStreetMap.
- **Editor Rich Text:** Formatta in grassetto, corsivo o elenchi puntati i tuoi pensieri.
- **Tag:** Organizza le tue idee aggiungendo tag visivi ad ogni appunto (chips).
- **Mobile-first Design:** UI altamente reattiva basata su Angular Material.
- **PWA Ready:** Installabile nativamente su desktop, iOS e Android.

## 🛠 Stack Tecnologico
- **Frontend:** Angular 18 (Standalone Components)
- **UI Framework:** Angular Material M3 (Custom Grayscale Theme)
- **Backend/DB:** Firebase (Authentication, Firestore Database, Cloud Messaging)
- **Lingua:** TypeScript, SCSS

## 🚀 Guida all'installazione
Per testare e sviluppare il progetto in locale:

1. **Clona questa repository:**
   ```bash
   git clone https://github.com/tuo-username/punto.git
   cd punto/frontend
   ```

2. **Installa le dipendenze:**
   ```bash
   npm install
   ```

3. **Configura Firebase:**
   Sostituisci i dati e la VAPID Key in `src/environments/environment.ts` con le credenziali reali prelevate dal tuo progetto Firebase.

4. **Avvia il server di sviluppo:**
   ```bash
   ng serve
   ```
   L'applicazione sarà viva e navigabile all'indirizzo `http://localhost:4200/`.

## 🌐 Messa online (GitHub Pages)
Questo progetto è configurato appositamente per poter essere ospitato gratuitamente (come sito statico) precaricato su GitHub Pages. Per pubblicarlo online non serve noleggiare un server, in quanto Firebase si occupa di gestire interamente la persistenza dei dati e gli account.

---
*Progettato e sviluppato per essere veloce, elegante e sempre a portata di mano.*
