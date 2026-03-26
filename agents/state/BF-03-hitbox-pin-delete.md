status: done
agent: alpha
task: Mobile bugfix — hitbox pin e cancella nella lista note troppo piccola
completato: Rimossa la regola `button { transform: scale(1.5); }` da `.mobile-full ::ng-deep .notes-list`. Aggiunto blocco `@media (max-width: 599.98px)` alla fine di dashboard.scss con `width: 44px !important; height: 44px !important;` per `.pin-btn` e `.delete-btn`, garantendo un tap target adeguato su mobile senza alterare la hitbox tramite transform.
bloccato_da:
