status: done
agent: alpha
task: Mobile — vista di default configurabile, preferenza salvata su DB
completato: Aggiunti metodi getUserPreference/setUserPreference in NoteService (con getDoc/setDoc su users/{uid}). In DashboardComponent: aggiunta proprietà defaultViewKey, caricamento preferenza in ngOnInit (solo su mobile), metodo setDefaultView con persistenza. Nel template, il bottone calendario ora chiama setDefaultView('calendar') invece di assegnare direttamente currentMainView.
bloccato_da:
