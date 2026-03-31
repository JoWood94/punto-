import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: 0,
  use: {
    baseURL: 'https://giuseppebosco.github.io/punto-/',
    headless: true,
    ignoreHTTPSErrors: true,
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
