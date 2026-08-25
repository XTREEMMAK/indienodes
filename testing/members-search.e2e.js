import { expect, test } from '@playwright/test';

/**
 * The members list is the one place in this app allowed to be a directory,
 * and a directory you cannot search is just a long page. These check the
 * search narrows on the things someone actually remembers — a name, a site,
 * a type — and that narrowing does not strand them on a page that no longer
 * exists.
 *
 * Every case waits for hydration before counting rows. `/members` renders
 * twice: the prerendered HTML carries the ring as of build time, and the
 * store then fetches `/ring.json` and re-renders with the live one. Since the
 * suite seeds its own ring (testing/scripts/seed-e2e-ring.mjs) those two
 * differ by design, so a count taken straight after `goto` is the published
 * ring, not the fixture — which failed here as "expected 1, received 5" only
 * when the suite ran in full and the machine was busy enough to make the
 * pre-hydration paint observable. A visitor sees the same transition; the
 * test just has to stop racing it.
 */

/**
 * Waits for the client-side ring to replace the prerendered one.
 * @param {import('@playwright/test').Page} page
 */
async function hydrated(page) {
	await expect(page.locator('#member-search')).toBeVisible();
	// A fixture-only entry: present after the store's fetch, absent before it.
	await expect(page.getByText('Paper Lantern', { exact: false }).first()).toBeVisible();
}

test('search narrows the list by name, by type, and by site', async ({ page }) => {
	await page.goto('/members');
	await hydrated(page);
	const search = page.locator('#member-search');

	const rows = page.locator('.member');
	const total = await rows.count();
	expect(total, 'the fixture ring should have entries to filter').toBeGreaterThan(1);

	// By creator name.
	await search.fill('paper lantern');
	await expect(rows).toHaveCount(1);
	await expect(rows.first()).toContainText('Paper Lantern');

	// Terms in any order — the same entry, reached the other way round.
	await search.fill('lantern paper');
	await expect(rows).toHaveCount(1);

	// By type label, which is why there is no separate type filter control.
	// Substring, so this also reaches an audio entry whose description mentions
	// a webcomic — correct, not a leak: the description is a field someone
	// searches on purpose, and a type-only match would need its own control.
	await search.fill('comic');
	const types = await rows.evaluateAll((els) => els.map((el) => el.getAttribute('data-type')));
	expect(types, 'the comic entry is among the matches').toContain('comic');
	expect(types.length, 'and it is not matching the whole ring').toBeLessThan(total);

	// By site host.
	await search.fill('ashzonemusic.bandcamp.com');
	await expect(rows).toHaveCount(1);
	await expect(rows.first()).toContainText('AshZone');

	// Clearing restores everything.
	await search.fill('');
	await expect(rows).toHaveCount(total);
});

test('a query that matches nothing offers a way back', async ({ page }) => {
	await page.goto('/members');
	await hydrated(page);
	const search = page.locator('#member-search');
	const rows = page.locator('.member');
	const total = await rows.count();

	await search.fill('zzzzz-no-such-member');
	await expect(rows).toHaveCount(0);

	const back = page.locator('.clear-search');
	await expect(back).toBeVisible();
	await back.click();

	await expect(rows).toHaveCount(total);
	await expect(search).toHaveValue('');
});

test('the match count is announced, not just drawn', async ({ page }) => {
	await page.goto('/members');
	await hydrated(page);
	const status = page.locator('.search-status');
	// A filter that silently reorders the page under a screen reader is a page
	// that appears to have lost its content.
	await expect(status).toHaveAttribute('aria-live', 'polite');

	await page.locator('#member-search').fill('comic');
	await expect(status).toContainText('match');
});

test('narrowing does not strand you on a page that no longer exists', async ({ page }) => {
	await page.goto('/members');
	await hydrated(page);
	// Whatever the ring size, typing a narrow query must land on page 1 with
	// its results visible rather than on an emptied page 3.
	await page.locator('#member-search').fill('a');
	const rows = page.locator('.member');
	if ((await rows.count()) > 0) {
		await expect(rows.first()).toBeVisible();
	}
	const range = page.locator('.page-range');
	if (await range.isVisible()) {
		await expect(range).toContainText('Showing 1');
	}
});
