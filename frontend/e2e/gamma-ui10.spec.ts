import { test } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

const VIEWPORTS = [
  { name: 'mobile-375', width: 375, height: 812 },
  { name: 'mobile-390', width: 390, height: 844 },
  { name: 'desktop-1280', width: 1280, height: 800 },
];

const BASE_URL = 'https://giuseppebosco.github.io/punto-/';
const SCREENSHOTS_DIR = path.resolve(__dirname, '../../agents/gamma-reports/screenshots');

test.beforeAll(() => {
  if (!fs.existsSync(SCREENSHOTS_DIR)) {
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  }
});

test('gamma-ui10-login', async ({ page }) => {
  for (const vp of VIEWPORTS) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');
    await page.screenshot({
      path: `${SCREENSHOTS_DIR}/${vp.name}-login.png`,
      fullPage: false,
    });
  }
});
