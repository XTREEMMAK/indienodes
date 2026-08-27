import { expect, test } from '@playwright/test';

test('join success shows confirmation and live embed previews', async ({ page }, testInfo) => {
	test.skip(testInfo.project.name !== 'join-mock-dev');

	await page.addInitScript(() => localStorage.clear());
	await page.setViewportSize({ width: 1280, height: 1000 });
	await page.goto('/join', { waitUntil: 'networkidle' });

	await page.getByRole('button', { name: 'Start', exact: true }).click();
	await page.getByRole('radio', { name: /Yes, I have a site/ }).check();
	await page.getByRole('button', { name: 'Continue', exact: true }).last().click();

	await page.locator('#f-creator').fill('Success Preview Test');
	await page.locator('#f-type').selectOption('audio');
	await page.locator('#f-why').fill('Exercises the final confirmation state.');
	await page.locator('#f-source').fill('https://example.com');
	await page.locator('#f-tags').fill('test');
	await page.locator('#f-tags').press('Enter');
	await page.getByRole('button', { name: 'Continue', exact: true }).last().click();

	await page.getByRole('button', { name: 'Continue', exact: true }).last().click();
	await page.getByRole('button', { name: 'Generate my token' }).click();
	await page.getByRole('button', { name: 'Verify', exact: true }).click();
	await expect(page.getByText('Verified. That page is yours.')).toBeVisible();
	await page.getByRole('button', { name: 'Continue', exact: true }).last().click();

	await page.locator('#f-email').fill('preview@example.com');
	await page.locator('#f-pro').selectOption('Not a member');
	await page.getByRole('checkbox', { name: /I confirm that I hold full rights/ }).check();
	await page.getByRole('checkbox', { name: /By submitting, you affirm/ }).check();
	await page.getByRole('button', { name: 'Continue', exact: true }).last().click();

	await page.getByRole('button', { name: 'Submit my entry' }).click();

	await expect(page.getByRole('heading', { name: 'Request Submitted!' })).toBeVisible();
	await expect(page.getByRole('heading', { name: 'That is in.' })).toHaveCount(0);
	await expect(page.locator('.success-check')).toBeVisible();
	await expect(page.locator('.success-tier-card')).toHaveCount(3);
	await expect(page.locator('.success-tier-card .success-preview-frame')).toHaveCount(3);
	await page.locator('.success-tier-card:has(input[value=badge])').click();
	await expect(page.locator('.success-badge-card')).toHaveCount(4);
	await expect(page.locator('.success-badge-card .success-preview-frame')).toHaveCount(4);
	await expect(page.locator('.success-tier-card.selected')).toContainText('Badge');
});
