status: done
agent: beta
task: Fix GitHub Pages — assets 404, base-href mancante
completed: Bug trovato: deploy.yml non aveva --base-href /punto-/ nel build step. Commit 5bc66fa aggiunge il flag. Deploy #131 success. Verificato: release_pages ora ha <base href="/punto-/">. Asset su jowood94.github.io/punto-/ dovranno caricare correttamente.
