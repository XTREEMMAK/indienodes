import { expect, test } from '@playwright/test';

const visibleResizeHandles = (page) =>
	page.locator('.grid-stack-item .ui-resizable-handle:visible');

const storedComic = (page) =>
	page.evaluate(() => {
		const raw = localStorage.getItem('indienode:layout:v1');
		const layout = raw ? JSON.parse(raw) : [];
		return layout.find((node) => node.id === 'n-comic-1');
	});

test('reduced desktop layouts offer bidirectional node resizing above 400px', async ({ page }) => {
	await page.setViewportSize({ width: 1024, height: 900 });
	await page.goto('/');
	await expect(page.locator('.grid-stack.gs-visible')).toBeVisible();
	await page.getByRole('button', { name: 'Arrange field' }).click();

	const comicNode = page.locator('.grid-stack-item[gs-id="n-comic-1"]');
	await expect(comicNode.locator('.ui-resizable-handle:visible')).toHaveCount(5);
	const before = (await storedComic(page)) ?? { w: 4, h: 6 };

	const southHandle = comicNode.locator('.ui-resizable-s');
	const southBox = await southHandle.boundingBox();
	if (!southBox) throw new Error('The south resize handle has no bounding box');
	await page.mouse.move(southBox.x + southBox.width / 2, southBox.y + southBox.height / 2);
	await page.mouse.down();
	await page.mouse.move(southBox.x + southBox.width / 2, southBox.y + southBox.height / 2 + 140, {
		steps: 8
	});
	await page.mouse.up();

	await expect.poll(() => storedComic(page).then((node) => node?.w)).toBe(before.w);
	await expect.poll(() => storedComic(page).then((node) => node?.h)).toBeGreaterThan(before.h);
	const afterHeight = await storedComic(page);
	if (!afterHeight) throw new Error('The vertical resize was not persisted');

	const horizontalHandle = comicNode.locator('.ui-resizable-w');
	const horizontalBox = await horizontalHandle.boundingBox();
	if (!horizontalBox) throw new Error('The west resize handle has no bounding box');
	await page.mouse.move(
		horizontalBox.x + horizontalBox.width / 2,
		horizontalBox.y + horizontalBox.height / 2
	);
	await page.mouse.down();
	await page.mouse.move(
		horizontalBox.x + horizontalBox.width / 2 - 140,
		horizontalBox.y + horizontalBox.height / 2,
		{
			steps: 8
		}
	);
	await page.mouse.up();

	await expect.poll(() => storedComic(page).then((node) => node?.w)).toBeGreaterThan(afterHeight.w);

	await page.setViewportSize({ width: 400, height: 900 });
	await expect(visibleResizeHandles(page)).toHaveCount(0);

	await page.setViewportSize({ width: 401, height: 900 });
	await expect(comicNode.locator('.ui-resizable-s')).toBeVisible();
	await expect(visibleResizeHandles(page)).toHaveCount(25);
});
