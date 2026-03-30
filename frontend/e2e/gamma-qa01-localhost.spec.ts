import { test } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

const BASE_URL = 'https://localhost:4200';
const EMAIL = 'giuseppe_bosco@icloud.com';
const PASSWORD = 'PuntoDeveloper94!';
const SCREENSHOTS_DIR = path.resolve(__dirname, '../../agents/gamma-reports/screenshots/qa01-localhost');

test.beforeAll(() => {
  if (!fs.existsSync(SCREENSHOTS_DIR)) {
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  }
});

async function login(page: any) {
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await page.waitForSelector('input[type="email"], input[formControlName="email"]', { timeout: 10000 });
  await page.locator('input[type="email"], input[formControlName="email"]').first().fill(EMAIL);
  await page.locator('input[type="password"], input[formControlName="password"]').first().fill(PASSWORD);
  await page.locator('button[type="submit"], button:has-text("Accedi")').first().click();
  await page.waitForURL(/dashboard/, { timeout: 15000 });
  await page.waitForLoadState('networkidle');
}

// ─── LOGIN PAGE ────────────────────────────────────────────────────────────────
test('01 - login page', async ({ page }) => {
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await page.screenshot({ path: `${SCREENSHOTS_DIR}/login.png`, fullPage: true });
});

// ─── DASHBOARD — sidenav chiusa (mobile) ──────────────────────────────────────
test('02 - dashboard sidenav chiusa', async ({ page }) => {
  await login(page);
  // Chiudi sidenav se aperta (click fuori)
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SCREENSHOTS_DIR}/dashboard-sidenav-closed.png`, fullPage: false });
});

// ─── DASHBOARD — sidenav aperta ───────────────────────────────────────────────
test('03 - dashboard sidenav aperta', async ({ page }) => {
  await login(page);
  // Apri sidenav se chiusa (cerca hamburger)
  const hamburger = page.locator('button[aria-label*="menu"], button mat-icon:text("menu")').first();
  const isVisible = await hamburger.isVisible().catch(() => false);
  if (isVisible) {
    await hamburger.click();
    await page.waitForTimeout(400);
  }
  await page.screenshot({ path: `${SCREENSHOTS_DIR}/dashboard-sidenav-open.png`, fullPage: false });
});

// ─── SETTINGS FAB — visibile nella sidenav ────────────────────────────────────
test('04 - settings FAB nella sidenav', async ({ page }) => {
  await login(page);
  // Assicurati sidenav aperta (desktop: sempre; mobile: apri)
  const hamburger = page.locator('button[aria-label*="menu"], button:has(mat-icon:text("menu"))').first();
  const isVisible = await hamburger.isVisible().catch(() => false);
  if (isVisible) {
    await hamburger.click();
    await page.waitForTimeout(400);
  }
  // Screenshot con sidenav aperta — il FAB deve essere bottom-left
  await page.screenshot({ path: `${SCREENSHOTS_DIR}/settings-fab-closed.png`, fullPage: false });
});

// ─── SETTINGS FAB — menu aperto (speed dial) ──────────────────────────────────
test('05 - settings FAB menu aperto', async ({ page }) => {
  await login(page);
  const hamburger = page.locator('button[aria-label*="menu"], button:has(mat-icon:text("menu"))').first();
  const isVisible = await hamburger.isVisible().catch(() => false);
  if (isVisible) {
    await hamburger.click();
    await page.waitForTimeout(400);
  }
  // Clicca il FAB settings
  const fab = page.locator('.settings-fab, button[aria-label="Impostazioni"]').first();
  await fab.waitFor({ timeout: 5000 });
  await fab.click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${SCREENSHOTS_DIR}/settings-fab-open.png`, fullPage: false });
});

// ─── HEADER — verifica assenza logout nell'header ─────────────────────────────
test('06 - header senza logout', async ({ page }) => {
  await login(page);
  await page.screenshot({ path: `${SCREENSHOTS_DIR}/header-no-logout.png`, fullPage: false });
});

// ─── MOBILE CALENDARIO — settings nell'header ─────────────────────────────────
test('07 - mobile calendario settings header', async ({ page }) => {
  await login(page);
  // Naviga alla vista calendario
  const calBtn = page.locator('button[aria-label*="calendar"], button:has(mat-icon:text("calendar_month")), button:has(mat-icon:text("event"))').first();
  const calVisible = await calBtn.isVisible().catch(() => false);
  if (calVisible) {
    await calBtn.click();
    await page.waitForTimeout(400);
  }
  await page.screenshot({ path: `${SCREENSHOTS_DIR}/mobile-calendar-settings-header.png`, fullPage: false });
});

// ─── MOBILE CALENDARIO — dropdown settings aperto ────────────────────────────
test('08 - mobile calendario settings dropdown', async ({ page }) => {
  await login(page);
  const calBtn = page.locator('button[aria-label*="calendar"], button:has(mat-icon:text("calendar_month")), button:has(mat-icon:text("event"))').first();
  const calVisible = await calBtn.isVisible().catch(() => false);
  if (calVisible) {
    await calBtn.click();
    await page.waitForTimeout(400);
  }
  // Cerca il bottone settings nell'header (mobile calendario)
  const settingsBtn = page.locator('button[aria-label="Impostazioni"]').first();
  const settingsVisible = await settingsBtn.isVisible().catch(() => false);
  if (settingsVisible) {
    await settingsBtn.click();
    await page.waitForTimeout(300);
  }
  await page.screenshot({ path: `${SCREENSHOTS_DIR}/mobile-calendar-settings-dropdown.png`, fullPage: false });
});
