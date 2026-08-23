import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const audio = fs.readFileSync(path.join(__dirname, 'sites/ashzone/audio/xeno.mp3'));

/**
 * The minimized player's drag, clamp and persistence had no coverage at all
 * before it became its own component. The clamp arithmetic is unit-tested in
 * miniPlayerPosition.test.js; this checks the wiring around it.
 */
test('the mini player drags, persists, and expands again', async ({ page }) => {
	await page.route('https://example.invalid/**', (r) =>
		/\.(mp3|wav)/i.test(r.request().url())
			? r.fulfill({ status: 200, contentType: 'audio/mpeg', body: audio })
			: r.fulfill({
					status: 200,
					contentType: 'image/svg+xml',
					body: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>'
				})
	);
	const errors = [];
	page.on('pageerror', (e) => errors.push(String(e)));

	await page.setViewportSize({ width: 1280, height: 900 });
	await page.goto('/');
	await page
		.getByRole('button', { name: /^Play / })
		.first()
		.click();
	await expect(page.locator('.player')).toBeVisible();

	await page.getByRole('button', { name: 'Minimize player' }).click();
	const dock = page.locator('.mini-player');
	await expect(dock).toBeVisible();

	const before = await dock.boundingBox();

	// Drag it by its handle.
	const handle = page.locator('.mini-drag-handle');
	const hb = await handle.boundingBox();
	await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
	await page.mouse.down();
	await page.mouse.move(400, 300, { steps: 10 });
	await page.mouse.up();

	const after = await dock.boundingBox();
	expect(after.x, 'dock should have moved').not.toBeCloseTo(before.x, 0);

	// The position is remembered.
	const stored = await page.evaluate(() =>
		JSON.parse(localStorage.getItem('indienode:player-position:v1') ?? 'null')
	);
	expect(stored).not.toBeNull();
	expect(Number.isFinite(stored.x)).toBe(true);

	// Still on screen, and still expandable back to the full player.
	expect(after.x).toBeGreaterThanOrEqual(0);
	expect(after.x + after.width).toBeLessThanOrEqual(1280);
	await page.getByRole('button', { name: /^Expand player/ }).click();
	await expect(page.locator('.player')).toBeVisible();
	await expect(dock).toHaveCount(0);

	expect(errors).toEqual([]);
});
