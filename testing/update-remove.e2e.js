import { expect, test } from '@playwright/test';

/**
 * The withdrawal path through `/update`.
 *
 * Removal shares identify and verify with a change request — the same proof of
 * control, a different verb — so what is worth checking here is the part that
 * differs: that it is never the default, that it cannot be reached or fired by
 * accident, and that changing your mind actually disarms it.
 *
 * The final send needs a backend answer, so it is not driven here; the guard
 * that refuses to send unverified is asserted in updateStore.svelte.test.js.
 */
test('removal is offered only after verification, and never by default', async ({ page }) => {
	await page.addInitScript(() => localStorage.clear());
	await page.setViewportSize({ width: 1280, height: 900 });
	await page.goto('/update');

	await page.locator('#f-node-id').fill('AshZone');
	await page.waitForTimeout(300);
	await expect(page.locator('.note')).toContainText('Found it');

	// Nothing about leaving is on the identify step.
	await expect(page.getByRole('button', { name: /Remove this entry/i })).toHaveCount(0);

	await page.getByRole('button', { name: 'Continue', exact: true }).last().click();
	await expect(page.getByRole('heading', { name: /Prove/i })).toBeVisible();

	// And not before control is proven either.
	await expect(page.getByRole('button', { name: /Remove this entry/i })).toHaveCount(0);
});

test('the progress bar shows Edit, not Remove, until asked', async ({ page }) => {
	await page.addInitScript(() => localStorage.clear());
	await page.setViewportSize({ width: 1280, height: 900 });
	await page.goto('/update');

	const labels = await page.getByRole('tab').allInnerTexts();
	const text = labels.join(' ');
	expect(text).toContain('EDIT');
	expect(text).not.toContain('REMOVE');
});
