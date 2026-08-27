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
	excerpts: [''],
	thumb_url: '',
	thumb_position: { x: 50, y: 50 },
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
	await expect(page.locator('#f-cover-file')).toBeVisible();
	await page.locator('#f-cover-file').setInputFiles({
		name: 'cover.png',
		mimeType: 'image/png',
		buffer: Buffer.from(
			'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZrL8AAAAASUVORK5CYII=',
			'base64'
		)
	});
	await expect(page.locator('.node-preview-card img.backdrop')).toHaveAttribute('src', /^blob:/);
	await page.getByRole('button', { name: 'Continue', exact: true }).last().click();
	await expect(page.getByRole('heading', { name: 'Your tracks' })).toBeVisible();
	await page.getByRole('button', { name: 'Continue', exact: true }).last().click();
	await expect(page.locator('#f-icon')).toHaveCount(0);
	const pickerIsInStickyPreview = await page.locator('#f-template').evaluate((element) => {
		const preview = element.closest('.builder-preview');
		return Boolean(preview) && getComputedStyle(preview).position === 'sticky';
	});
	expect(pickerIsInStickyPreview).toBe(true);
	await expect(page.getByRole('heading', { name: 'Build your page' })).toBeVisible();

	const frame = page.locator('iframe.preview-frame');
	const initialPreview = await frame.getAttribute('srcdoc');
	await page
		.locator('.step-body')
		.last()
		.evaluate((element) => {
			element.scrollTop = 1400;
		});
	await page.locator('#f-template').selectOption('midnight-echo');

	await expect(page.locator('#f-template')).toHaveValue('midnight-echo');
	await expect.poll(() => frame.getAttribute('srcdoc')).not.toBe(initialPreview);
	await expect
		.poll(() => page.locator('.join-layout').evaluate((element) => element.scrollTop))
		.toBe(0);
	const panelBox = await page.locator('#join-panel').boundingBox();
	expect(panelBox).not.toBeNull();
	expect(panelBox?.y).toBeGreaterThan(0);
});
