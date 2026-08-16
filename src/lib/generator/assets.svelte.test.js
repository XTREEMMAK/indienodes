/**
 * Runs under the "client" vitest project (real `OffscreenCanvas` and
 * `createImageBitmap`, via Playwright's chromium) — see the same note in
 * `draftDb.svelte.test.js` about why the `.svelte.test.js` name matters here
 * even though nothing in this file uses Svelte.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { ACCEPTED_IMAGE_TYPES, ICON_DEFAULTS, WORK_IMAGE_DEFAULTS, toWebp } from './assets.js';

/**
 * A real, decodable image blob, generated rather than fixture-loaded: a
 * solid-color rectangle is all `createImageBitmap` needs to succeed, and
 * generating it keeps this test file self-contained.
 * @param {number} width
 * @param {number} height
 * @param {string} [type]
 */
async function fakeImage(width, height, type = 'image/png') {
	const canvas = new OffscreenCanvas(width, height);
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('no 2d context in test environment');
	ctx.fillStyle = '#336699';
	ctx.fillRect(0, 0, width, height);
	return canvas.convertToBlob({ type });
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe('toWebp', () => {
	it('encodes as image/webp when the browser supports it', async () => {
		const source = await fakeImage(64, 64);
		const result = await toWebp(source);
		expect(result.mimeType).toBe('image/webp');
		expect(result.blob.type).toBe('image/webp');
		expect(result.blob.size).toBeGreaterThan(0);
	});

	it('downscales an oversized image to fit maxDimension on its longer side', async () => {
		const source = await fakeImage(2000, 1000);
		const result = await toWebp(source, { maxDimension: 500 });
		expect(result.width).toBe(500);
		expect(result.height).toBe(250);
	});

	it('never upscales an image already smaller than maxDimension', async () => {
		const source = await fakeImage(100, 80);
		const result = await toWebp(source, { maxDimension: 1600 });
		expect(result.width).toBe(100);
		expect(result.height).toBe(80);
	});

	it('preserves aspect ratio when downscaling a portrait image', async () => {
		const source = await fakeImage(400, 1000);
		const result = await toWebp(source, { maxDimension: 500 });
		expect(result.width).toBe(200);
		expect(result.height).toBe(500);
	});

	it('falls back to the source mime type when WebP encoding is unavailable', async () => {
		// Simulates the real-world failure mode this exists to handle: the
		// browser does not throw, it silently ignores the requested type and
		// hands back something else (commonly PNG). toWebp is written to
		// detect that by checking the *returned* blob.type, not by trying to
		// feature-detect WebP support ahead of time, so the test forces
		// exactly that mismatch rather than simulating a thrown error.
		// Built with the real implementation, before the spy below goes in:
		// otherwise this helper's own internal convertToBlob call would be
		// the first one the spy sees, off-by-one-ing the count against
		// toWebp's own two calls.
		const source = await fakeImage(50, 50);

		const original = OffscreenCanvas.prototype.convertToBlob;
		let call = 0;
		vi.spyOn(OffscreenCanvas.prototype, 'convertToBlob').mockImplementation(
			/** @this {OffscreenCanvas} */
			function (opts) {
				call++;
				// First call is toWebp's own WebP attempt; force it to return a
				// PNG regardless of what was asked for, simulating a browser
				// that silently ignores the requested type. Second call is
				// toWebp's own fallback attempt; let it through to the real
				// implementation so the module's recovery path actually runs.
				if (call === 1) return original.call(this, { type: 'image/png' });
				return original.call(this, opts);
			}
		);

		const result = await toWebp(source);
		expect(result.mimeType).not.toBe('image/webp');
		expect(result.blob.size).toBeGreaterThan(0);
	});
});

describe('defaults', () => {
	it('icon defaults are smaller than work-image defaults', () => {
		expect(ICON_DEFAULTS.maxDimension).toBeLessThan(WORK_IMAGE_DEFAULTS.maxDimension);
	});

	it('exposes the accepted upload types the spec lists', () => {
		for (const type of ['image/png', 'image/jpeg', 'image/webp', 'image/gif']) {
			expect(ACCEPTED_IMAGE_TYPES).toContain(type);
		}
	});
});
