<!-- task inviato: 2026-03-28T17:03:06.215Z -->

status: in_progress
agent: beta
task: Configurare Playwright per usare Google Chrome di sistema

## Obiettivo
Playwright è già installato (v1.58.2) ma i browser headless non sono scaricati.
Chrome è installato in /Applications/Google Chrome.app — usarlo direttamente.

## Cosa fare

1. Crea o aggiorna `frontend/playwright.config.ts` con questa configurazione:

```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '../e2e',
  timeout: 30_000,
  retries: 0,
  use: {
    baseURL: 'https://giuseppebosco.github.io/punto-/',
    headless: true,
    channel: 'chrome',   // usa Chrome di sistema, non Chromium scaricato
  },
  projects: [
    {
      name: 'mobile-375',
      use: { ...devices['iPhone SE'] },
    },
    {
      name: 'mobile-390',
      use: { ...devices['iPhone 14'] },
    },
    {
      name: 'desktop-1280',
      use: { viewport: { width: 1280, height: 800 } },
    },
  ],
  outputDir: '../agents/gamma-reports/screenshots',
});
```

2. Crea la directory `e2e/` nella root del progetto se non esiste

3. Verifica che funzioni con:
```bash
cd frontend && npx playwright test --list
```

## File da creare/modificare
- `frontend/playwright.config.ts`
- `e2e/` (directory, crearla se assente)

## Completamento
Aggiorna `agents/state/B-PLAYWRIGHT-setup.md` con status: done + completato.

---

## Task successivo (dopo B-PLAYWRIGHT): avvia dev server per QA Gamma

Appena B-PLAYWRIGHT è done, avvia il dev server Angular:

```bash
cd frontend && npm start
```

Server su https://localhost:4200 con SSL — tienilo attivo finché Gamma non ha completato la QA localhost.
Quando è su, notifica il Team Lead scrivendo in `agents/inbox/lead.md`.
