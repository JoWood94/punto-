import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 40_000,
  retries: 0,
  use: {
    baseURL: 'https://localhost:4200',
    headless: true,
    ignoreHTTPSErrors: true,
    launchOptions: {
      args: ['--ignore-certificate-errors', '--disable-web-security'],
    },
  },
  projects: [
    {
      name: 'mobile-375',
      use: { viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
    },
    {
      name: 'mobile-390',
      use: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
    },
    {
      name: 'desktop-1280',
      use: { viewport: { width: 1280, height: 800 } },
    },
  ],
  outputDir: '../agents/gamma-reports/screenshots',
});
