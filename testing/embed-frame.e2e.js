import { expect, test } from '@playwright/test';

// /embed-frame is the sandboxed-iframe widget target a member's page loads
// cross-origin (src/routes/embed-frame/+page.svelte, docs/decisions.md's
// widget-iframe-isolation entry). This suite runs it through the preview
// server directly, same-origin -- it cannot exercise the real cross-origin
// sandboxed embedding a member site does (that needs a real second origin
// and is tracked as its own, larger e2e gap), but it does confirm the page
// itself renders correctly and carries none of the main app's chrome, which
// is exactly what a regression in the root layout's isEmbedFrame branch
// would break silently.

test('embed-frame renders the widget with no app chrome', async ({ page }) => {
	await page.goto('/embed-frame?site-id=audio-ashzone-xeno');

	// None of the main app's floating chrome exists on this route.
	await expect(page.locator('.brand-float')).toHaveCount(0);
	await expect(page.locator('.menu-trigger')).toHaveCount(0);
	await expect(page.locator('.nav-mobile')).toHaveCount(0);
	await expect(page.locator('.desktop-tools')).toHaveCount(0);

	// The real widget mounts and becomes interactive. Playwright's locators
	// pierce an open shadow root, which is exactly what indienode-widget uses.
	const widget = page.locator('indienode-widget');
	await expect(widget).toBeVisible();
	await expect(widget.getByRole('region', { name: 'IndieNodes webring' })).toBeVisible();
	await expect(widget.getByRole('button', { name: /Next/ })).toBeEnabled();
	await expect(widget.getByRole('button', { name: 'Random' })).toBeEnabled();
});

test('embed-frame with no site-id still renders a working widget', async ({ page }) => {
	// A host page that hasn't set site-id yet (or a creator previewing before
	// approval) gets a random starting point rather than a broken widget --
	// same contract Widget.svelte's own siteId-not-found fallback already
	// guarantees.
	await page.goto('/embed-frame');

	const widget = page.locator('indienode-widget');
	await expect(widget).toBeVisible();
	await expect(widget.getByRole('region', { name: 'IndieNodes webring' })).toBeVisible();
});

test('the /widget demo page live-previews the real sandboxed iframe', async ({ page }) => {
	await page.goto('/widget');

	const frame = page.frameLocator('iframe[title="IndieNodes webring"]');
	await expect(frame.getByRole('region', { name: 'IndieNodes webring' })).toBeVisible();
});
