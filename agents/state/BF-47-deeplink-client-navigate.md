status: done
agent: alpha
task: Fix deep link notifica — client.navigate() invece di postMessage su iOS PWA

## ⛔ NO deploy — attendo validazione Giuseppe in locale
completed: firebase-messaging-sw.js: ramo "app già aperta" sostituito con client.navigate(targetUrl).then(c => c?.focus()) — naviga all'URL con ?openNote= che dashboard legge in ngOnInit. Rimossi postMessage e client.focus() standalone. Il listener swMessageListener in dashboard resta come fallback.
bloccato_da:
