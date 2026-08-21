import { expect, test } from '@playwright/test';

const templates = {
	audio: ['late-signal', 'midnight-echo', 'neon-signal', 'static-ticker'],
	comic: ['panel-room', 'issue-box', 'ink-splash', 'print-run'],
	text: ['marginalia', 'field-notes', 'front-page', 'essay-archive'],
	game: ['cartridge', 'arcade-hud', 'neon-circuit', 'pixel-archives']
};

test.use({ viewport: { width: 1280, height: 900 } });

for (const [type, ids] of Object.entries(templates)) {
	for (const id of ids) {
		test(`${type}/${id} matches its long-content reference image`, async ({ page }) => {
			await page.route('**/*', (route) => {
				const url = new URL(route.request().url());
				if (url.hostname === 'localhost') return route.continue();
				return route.abort();
			});
			await page.goto(`http://localhost:4175/${type}/${id}/`, {
				waitUntil: 'networkidle'
			});
			await page.evaluate(async () => {
				await document.fonts.ready;
				await Promise.all(
					[...document.images]
						.filter((image) => !image.complete)
						.map(
							(image) =>
								new Promise((resolve) => {
									image.addEventListener('load', resolve, { once: true });
									image.addEventListener('error', resolve, { once: true });
								})
						)
				);
			});
			await expect(page).toHaveScreenshot(`${type}-${id}.png`, {
				animations: 'disabled',
				fullPage: true,
				maxDiffPixelRatio: 0.005
			});
		});
	}
}
