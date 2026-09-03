import { expect, test } from '@playwright/test';

const MOBILE_VIEWPORT = { width: 400, height: 1146 };

test.beforeEach(async ({ page }) => {
	await page.setViewportSize(MOBILE_VIEWPORT);
});

test('members use cover art as a readable full-card mobile background', async ({ page }) => {
	await page.route('https://f4.bcbits.com/**', (route) =>
		route.fulfill({
			status: 200,
			contentType: 'image/svg+xml',
			body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="240"><path fill="#345" d="M0 0h400v240H0z"/><circle fill="#d86" cx="300" cy="80" r="70"/></svg>'
		})
	);
	await page.goto('/members');
	await expect(page.locator('#member-search')).toBeVisible();
	await expect(page.getByText('Paper Lantern', { exact: false }).first()).toBeVisible();

	const member = page.locator('.member.has-cover').first();
	await expect(member).toBeVisible();

	const dimensions = await member.evaluate((element) => {
		const thumbElement = element.querySelector('.thumb');
		return {
			memberWidth: element.clientWidth,
			memberHeight: element.clientHeight,
			thumbWidth: thumbElement?.clientWidth,
			thumbHeight: thumbElement?.clientHeight
		};
	});
	expect(dimensions.thumbWidth).toBe(dimensions.memberWidth);
	expect(dimensions.thumbHeight).toBe(dimensions.memberHeight);

	await expect(member.locator('.member-why')).toHaveCSS('font-size', '18.4px');
});

test('mobile modal and submission routes use the compact type scale', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'Ambient', exact: true }).click();

	const dialog = page.getByRole('dialog', { name: 'Start ambient view?' });
	await expect(dialog).toBeVisible();
	await expect(dialog.getByRole('heading', { name: 'Start ambient view?' })).toHaveCSS(
		'font-size',
		'28.8px'
	);
	await expect(dialog.locator('.consent-copy')).toHaveCSS('font-size', '22.4px');

	await page.goto('/join');
	await expect(page.locator('.join-page')).toHaveCSS('font-size', '22.4px');

	await page.goto('/update');
	await expect(page.locator('.join-page')).toHaveCSS('font-size', '22.4px');
});

test('mobile arrange buttons reorder nodes and persist the sequence', async ({ page }) => {
	await page.goto('/');
	await expect(page.locator('.grid-stack.gs-visible')).toBeVisible();

	const nodes = page.locator('.grid-stack-item');
	const before = await nodes.evaluateAll((items) =>
		items.map((item) => item.getAttribute('gs-id'))
	);
	expect(before.length).toBeGreaterThan(1);

	await page.getByRole('button', { name: 'Arrange field' }).click();
	const controls = page.locator('.mobile-reorder');
	await expect(controls).toHaveCount(before.length);
	await expect(controls.first().getByRole('button', { name: /node up$/ })).toBeDisabled();
	await expect(controls.last().getByRole('button', { name: /node down$/ })).toBeDisabled();

	await controls
		.nth(1)
		.getByRole('button', { name: /node up$/ })
		.click();

	const expected = [...before];
	[expected[0], expected[1]] = [expected[1], expected[0]];
	await expect
		.poll(() => nodes.evaluateAll((items) => items.map((item) => item.getAttribute('gs-id'))))
		.toEqual(expected);
	await expect
		.poll(() =>
			page.evaluate(() => {
				const raw = localStorage.getItem('indienode:layout:v1');
				return raw ? JSON.parse(raw).map((node) => node.id) : [];
			})
		)
		.toEqual(expected);
});
