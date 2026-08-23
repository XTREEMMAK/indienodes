import { expect, test } from '@playwright/test';

/**
 * Every store used to hand-roll its own persistence, and five of them wrote
 * without a guard — so a private window or a full quota threw straight out of
 * the click handler and the interaction failed, rather than merely not being
 * remembered. `safeWriteJson` is the shared guard; this asserts it holds from
 * the outside, where a visitor would feel it.
 */
test('liking survives a localStorage that refuses writes', async ({ page }) => {
	await page.route('https://example.invalid/**', (r) =>
		r.fulfill({
			status: 200,
			contentType: 'image/svg+xml',
			body: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>'
		})
	);
	await page.setViewportSize({ width: 1400, height: 900 });

	// Simulate a private window / full quota: reads work, writes throw.
	await page.addInitScript(() => {
		const real = Storage.prototype.setItem;
		Storage.prototype.setItem = function (k, v) {
			if (String(k).startsWith('indienode:')) throw new DOMException('QuotaExceededError');
			return real.call(this, k, v);
		};
	});

	/** @type {string[]} */
	const errors = [];
	page.on('pageerror', (e) => errors.push(String(e)));

	await page.goto('/');
	await page.waitForTimeout(1000);

	const like = page.getByRole('button', { name: /Add .* to favorites/ }).first();
	await like.waitFor({ state: 'visible' });
	await like.click();
	await page.waitForTimeout(300);

	// The like registers in the UI even though it could not be persisted.
	await expect(
		page.getByRole('button', { name: /Remove .* from favorites/ }).first()
	).toBeVisible();
	expect(errors, `unhandled errors: ${errors.join(' | ')}`).toEqual([]);
});
