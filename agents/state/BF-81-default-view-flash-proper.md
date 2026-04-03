status: done
agent: alpha
task: Fix flash vista default — gating con isReady su calendario e sidenav

## ⛔ NO deploy — attendo validazione Giuseppe in locale
completed: dashboard.ts: currentMainView inizializzato da localStorage('punto_defaultView') ?? 'list'; ngOnInit sincronizza localStorage dopo lettura Firestore; setDefaultView salva anche in localStorage. Build OK.
