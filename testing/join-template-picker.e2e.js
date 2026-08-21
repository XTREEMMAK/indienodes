import { expect, test } from '@playwright/test';

const draft = {
	creator: 'Test Artist',
	type: 'audio',
	why: 'A sufficiently detailed reason for joining this independent creator ring.',
	has_own_site: 'no',
	source_url: '',
	tags: ['experimental'],
	tracks: [],
	pages: [],
	excerpt: '',
	thumb_url: '',
	preview_url: '',
	explicit: false
};

test('switching templates updates the preview without hiding the form', async ({ page }) => {
	await page.addInitScript((entry) => {
		localStorage.setItem('indienode:submission-draft:v1', JSON.stringify(entry));
	}, draft);
	await page.goto('/join');

	await page.getByRole('button', { name: 'Start', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'Do you have a site?' })).toBeVisible();
	await page.getByRole('button', { name: 'Continue', exact: true }).last().click();
	await expect(page.getByRole('heading', { name: 'Your entry' })).toBeVisible();
	await expect(page.locator('#f-type option[value="audio"]')).toHaveText('Music');
	await page.getByRole('button', { name: 'Continue', exact: true }).last().click();
	await expect(page.getByRole('heading', { name: 'Your tracks' })).toBeVisible();
	await page.getByRole('button', { name: 'Continue', exact: true }).last().click();
	await expect(page.getByRole('heading', { name: 'Build your page' })).toBeVisible();

	const frame = page.locator('iframe.preview-frame');
	const initialPreview = await frame.getAttribute('srcdoc');
	await page
		.locator('.step-body')
		.last()
		.evaluate((element) => {
			element.scrollTop = 1400;
		});
	await page.getByText('Midnight Echo', { exact: true }).click();

	await expect(page.locator('input[name="template"]:checked')).toHaveValue('midnight-echo');
	await expect.poll(() => frame.getAttribute('srcdoc')).not.toBe(initialPreview);
	await expect
		.poll(() => page.locator('.join-layout').evaluate((element) => element.scrollTop))
		.toBe(0);
	const panelBox = await page.locator('#join-panel').boundingBox();
	expect(panelBox).not.toBeNull();
	expect(panelBox?.y).toBeGreaterThan(0);
});
