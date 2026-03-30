status: done
agent: beta
task: Configurare Playwright per usare Google Chrome di sistema
completato: |
  - frontend/playwright.config.ts aggiornato: testDir ../e2e, channel chrome, 3 projects (mobile-375, mobile-390, desktop-1280), outputDir ../agents/gamma-reports/screenshots
  - Creata directory e2e/ nella root del progetto
  - Creata directory agents/gamma-reports/screenshots/
  - Verifica: npx playwright test --list → 0 test trovati (atteso, e2e/ vuota — Gamma deve scrivere i test)
  - Config pronta per QA Gamma
