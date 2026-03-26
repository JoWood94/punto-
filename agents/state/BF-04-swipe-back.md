status: done
agent: alpha
task: Mobile bugfix — swipe back non funziona per tornare dalla nota alla lista (ma non deve tornare al login)
completato: In `ngOnInit` aggiunto `window.history.pushState` iniziale e registrazione del listener `onMobilePopState`. In `ngOnDestroy` aggiunto `removeEventListener`. Aggiunto metodo arrow function `onMobilePopState` che ri-pusha lo stato per bloccare la navigazione browser e chiama `handleBackButton()` solo su mobile, impedendo così il ritorno al login.
bloccato_da:
