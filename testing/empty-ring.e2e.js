import { expect, test } from '@playwright/test';

/**
 * The ring with no members in it.
 *
 * This is where anyone forking this project to run their own ring starts, so
 * it has to be a state the app grows out of rather than a wall it hits. It is
 * also where this ring returns if every member is withdrawn.
 *
 * The suite seeds a five-entry fixture into the build (see
 * `testing/scripts/seed-e2e-ring.mjs`), so nothing else here ever exercises
 * the empty case. Rather than stand up a second server for it, these stub the
 * runtime fetch — the same interception the media specs already use. The
 * prerendered HTML still carries the seeded ring, so what this really pins is
 * the store's handling of an empty payload, which is the half a fork's first
 * deploy depends on.
 */

/** @param {import('@playwright/test').Page} page */
async function emptyRing(page) {
	await page.route('**/ring.json', (r) =>
		r.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
	);
}

test('every route serves with no members', async ({ page }) => {
	await emptyRing(page);
	/** @type {string[]} */
	const errors = [];
	page.on('weberror', (e) => errors.push(String(e.error())));

	for (const path of ['/', '/members', '/lists', '/join', '/update', '/contact']) {
		const response = await page.goto(path);
		expect(response?.status(), `${path} should serve`).toBeLessThan(400);
		const body = (await page.textContent('body')) ?? '';
		expect(body, `${path} should not surface a crash`).not.toMatch(
			/Cannot read|undefined is not|Internal Error/i
		);
	}

	expect(errors, 'an empty ring must not throw').toEqual([]);
});

test('the field view says the ring is empty rather than sitting blank', async ({ page }) => {
	await emptyRing(page);
	await page.goto('/');
	// A first-time visitor to a fork sees this before anything else.
	await expect(page.getByText(/ring is empty/i)).toBeVisible();
});

test('members offers an empty state and no search box', async ({ page }) => {
	await emptyRing(page);
	await page.goto('/members');
	await expect(page.getByText(/no members yet/i)).toBeVisible();
	// Nothing to search: the control would be furniture with no function.
	await expect(page.locator('#member-search')).toHaveCount(0);
});

test('ambient opens to a silent session instead of failing', async ({ page }) => {
	await emptyRing(page);
	await page.setViewportSize({ width: 1100, height: 760 });
	await page.goto('/');
	await page.getByRole('button', { name: 'Start ambient view' }).click();
	const confirm = page.getByRole('button', { name: 'Enter ambient view' });
	if (await confirm.isVisible().catch(() => false)) await confirm.click();

	// It opens. Entering a mode that has nothing to show must still be a mode,
	// not a dead end.
	await expect(page.getByRole('region', { name: 'Ambient view' })).toBeVisible();
	await expect(page.getByText(/No visual entries are available/i)).toBeVisible();
});
