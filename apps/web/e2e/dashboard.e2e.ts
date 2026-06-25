import { expect, test } from '@playwright/test';

// Smoke test: the dashboard renders all panels live off the engine WS. Requires
// the engine running on ws://localhost:8787 (synthetic feed is fine).
test('dashboard renders live panels off the engine WS', async ({ page }) => {
	await page.goto('/');

	// WS connects and the health bar reflects it.
	await expect(page.locator('.health')).toContainText('connected', { timeout: 20000 });

	// Gamma profile bars render from the (cached) combined surface.
	await expect
		.poll(async () => page.locator('.profile rect').count(), { timeout: 20000 })
		.toBeGreaterThan(0);

	// Key-levels and IV panels populate.
	await expect(page.locator('.levels .regime')).toBeVisible({ timeout: 20000 });
	await expect(page.locator('.iv .readout')).toBeVisible();

	// Scope toggle works.
	await page.getByRole('button', { name: 'SPX', exact: true }).click();
	await expect.poll(async () => page.locator('.profile rect').count()).toBeGreaterThan(0);

	await page.screenshot({ path: 'e2e-dashboard.png', fullPage: true });
});
