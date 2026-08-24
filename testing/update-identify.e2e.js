import { expect, test } from '@playwright/test';

/**
 * Two things a real browser is the only honest place to check.
 *
 * The email: `/update` used to keep it between visits and `/join` never did.
 * What matters is what a visitor's browser actually retains after a reload,
 * not what a store returns in isolation.
 *
 * The node id: it is displayed nowhere in this app, so someone who joined long
 * ago cannot type it. These walk the paths they would actually take instead.
 */

const KEY = 'indienode:update-draft:v1';

test('a typed email does not survive a reload', async ({ page }) => {
	await page.addInitScript(() => localStorage.clear());
	await page.setViewportSize({ width: 1280, height: 900 });
	await page.goto('/update');

	// Identify a node, then get to the step that asks for an email.
	await page.locator('#f-node-id').fill('audio-ashzone-xeno');
	await page.waitForTimeout(400);

	const stored = await page.evaluate((k) => localStorage.getItem(k), KEY);
	expect(stored, 'the draft should persist the node').toContain('audio-ashzone-xeno');
	expect(stored, 'but never an address').not.toContain('@');
});

test('a member finds their node by site address or by name', async ({ page }) => {
	await page.addInitScript(() => localStorage.clear());
	await page.setViewportSize({ width: 1280, height: 900 });

	for (const typed of ['ashzonemusic.bandcamp.com', 'AshZone']) {
		await page.goto('/update');
		await page.locator('#f-node-id').fill(typed);
		await page.waitForTimeout(400);
		await expect(page.locator('.note'), `typed: ${typed}`).toContainText('Found it');
		await expect(page.locator('.note')).toContainText('AshZone');
	}
});

test('the members list links a creator straight into the change form', async ({ page }) => {
	await page.addInitScript(() => localStorage.clear());
	await page.setViewportSize({ width: 1280, height: 900 });
	await page.goto('/members');

	const claim = page.getByRole('link', { name: 'This is mine' }).first();
	await expect(claim).toBeVisible();
	await claim.click();

	// Arrives already identified, with no id typed by hand.
	await expect(page).toHaveURL(/\/update\?node=/);
	await expect(page.locator('.note')).toContainText('Found it');
	await expect(page.locator('#f-node-id')).not.toHaveValue('');
});
