import { test, expect } from '@playwright/test';

// Per eseguire questi test è necessario un utente di test Firebase.
// Imposta TEST_EMAIL e TEST_PASSWORD come env vars.
const EMAIL    = process.env['TEST_EMAIL']    ?? '';
const PASSWORD = process.env['TEST_PASSWORD'] ?? '';

test.describe('Notes (autenticato)', () => {
  test.skip(!EMAIL || !PASSWORD, 'TEST_EMAIL / TEST_PASSWORD non impostati');

  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/email/i).fill(EMAIL);
    await page.getByLabel(/password/i).fill(PASSWORD);
    await page.getByRole('button', { name: /accedi/i }).click();
    await expect(page).toHaveURL(/dashboard/, { timeout: 10000 });
  });

  test('dashboard loads note list', async ({ page }) => {
    await expect(page.locator('mat-nav-list')).toBeVisible();
  });

  test('FAB creates a new note', async ({ page }) => {
    const fab = page.locator('button[aria-label*="nota"], button.fab, .fab-btn').first();
    await fab.click();
    await expect(page.locator('app-note-editor')).toBeVisible({ timeout: 4000 });
  });
});
