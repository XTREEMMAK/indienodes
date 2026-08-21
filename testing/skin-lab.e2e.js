import { expect, test } from '@playwright/test';

test('skin laboratory renders every type and exercises boundary controls', async ({
	page
}, testInfo) => {
	test.skip(testInfo.project.name !== 'skin-lab-dev');
	await page.goto('/dev/skins');

	await expect(page.getByRole('heading', { name: 'Skin Laboratory' })).toBeVisible();
	await expect(page.locator('html')).toHaveAttribute('data-ui-skin', 'glassmorphic');
	await expect(page.locator('.node')).toHaveCount(4);
	await expect(page.getByText('Midnight Receiver')).toBeVisible();
	await expect(page.getByText('Paper Lantern Comics')).toBeVisible();
	await expect(page.getByText('Loose Leaf Press')).toBeVisible();
	await expect(page.getByText('Tin Roof Studio')).toBeVisible();

	await page.getByLabel('Simulate reduced motion').check();
	await page.getByLabel('Pause timed content').check();
	await page.getByLabel('Include artwork').uncheck();
	await expect(page.locator('.node.has-image')).toHaveCount(0);
});

test('production does not publish the skin laboratory', async ({ page }, testInfo) => {
	test.skip(testInfo.project.name !== 'production');
	await page.goto('/dev/skins');
	await expect(page.getByRole('heading', { name: 'Skin Laboratory' })).toHaveCount(0);
	await expect(page.getByRole('heading', { name: "That node isn't here" })).toBeVisible();
});
