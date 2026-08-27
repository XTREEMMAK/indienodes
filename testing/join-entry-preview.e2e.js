import { expect, test } from '@playwright/test';

const draft = {
	creator: 'Tall Type',
	type: 'text',
	why: 'Independent essays and field notes from the edges.',
	has_own_site: 'yes',
	source_url: 'https://example.com',
	tags: ['writing'],
	tracks: [],
	pages: [],
	excerpts: [''],
	thumb_url: '',
	preview_url: '',
	explicit: false
};

test('the tallest node stays inside the preview on a short desktop viewport', async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 720 });
	await page.addInitScript((entry) => {
		localStorage.setItem('indienode:submission-draft:v1', JSON.stringify(entry));
	}, draft);
	await page.goto('/join');

	const joinPage = page.locator('.join-page');
	const compactBox = await joinPage.boundingBox();
	const widthMotion = await joinPage.evaluate((element) => {
		const style = getComputedStyle(element);
		return {
			property: style.transitionProperty,
			duration: style.transitionDuration
		};
	});
	expect(widthMotion.property).toContain('max-width');
	expect(widthMotion.duration).not.toBe('0s');

	await page.getByRole('button', { name: 'Start', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'Do you have a site?' })).toBeVisible();
	await page.getByRole('button', { name: 'Continue', exact: true }).last().click();
	await expect(page.getByRole('heading', { name: 'Your entry' })).toBeVisible();
	await expect(page.locator('#f-why')).toHaveAttribute('maxlength', '75');

	await page.getByText('Tall', { exact: true }).click();
	await page.waitForTimeout(350);

	const wideBox = await joinPage.boundingBox();
	expect(compactBox).not.toBeNull();
	expect(wideBox).not.toBeNull();
	expect(wideBox?.width ?? 0).toBeGreaterThan(compactBox?.width ?? 0);

	const stage = page.locator('.node-preview-stage');
	const card = page.locator('.node-preview-card');
	const [stageBox, cardBox, panelPosition] = await Promise.all([
		stage.boundingBox(),
		card.boundingBox(),
		page.locator('.node-preview-panel').evaluate((element) => getComputedStyle(element).position)
	]);

	expect(stageBox).not.toBeNull();
	expect(cardBox).not.toBeNull();
	expect(panelPosition).toBe('relative');
	expect((cardBox?.x ?? 0) + 1).toBeGreaterThanOrEqual(stageBox?.x ?? 0);
	expect((cardBox?.y ?? 0) + 1).toBeGreaterThanOrEqual(stageBox?.y ?? 0);
	expect((cardBox?.x ?? 0) + (cardBox?.width ?? 0)).toBeLessThanOrEqual(
		(stageBox?.x ?? 0) + (stageBox?.width ?? 0) + 1
	);
	expect((cardBox?.y ?? 0) + (cardBox?.height ?? 0)).toBeLessThanOrEqual(
		(stageBox?.y ?? 0) + (stageBox?.height ?? 0) + 1
	);
});
