status: done
agent: alpha
task: Bug E2E — secondo dispositivo chiede setup invece di unlock + logout forzato non funziona
completed: |
  Bug 1 (setup invece di unlock):
  - initEncryption() ora controlla encryptionSetup === true esplicitamente (bracket notation)
  - Se getUserDoc() ritorna null (offline/errore) e c'è chiave locale → procede senza dialog (evita setup improprio)
  - Se getUserDoc() null e nessuna chiave locale → return silenzioso (no setup su offline)

  Bug 2 (logout forzato solo al caricamento):
  - Aggiunto watchUserDoc(uid, callback) in NoteService: listener onSnapshot real-time su users/{uid}
  - Dashboard.ts: private userDocUnsub?: () => void, registrato in initEncryption(), pulito in ngOnDestroy()
  - Listener confronta sessionVersion Firestore vs localStorage → chiama authService.logout() + navigate('/login') immediatamente quando cambia

  Build production OK (nessun errore TS)
