/**
 * Runs under the "client" vitest project (real `OffscreenCanvas` and
 * `createImageBitmap`, via Playwright's chromium) — see the same note in
 * `draftDb.svelte.test.js` about why the `.svelte.test.js` name matters here
 * even though nothing in this file uses Svelte.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	ACCEPTED_AUDIO_TYPES,
	ACCEPTED_IMAGE_TYPES,
	ICON_DEFAULTS,
	MAX_AUDIO_BYTES,
	MAX_IMAGE_BYTES,
	WORK_IMAGE_DEFAULTS,
	isAnimatedImage,
	rejectionReason,
	toDataUrl,
	toWebp
} from './assets.js';

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

	it('preserves an animated GIF rather than flattening it through canvas', async () => {
		const source = gifWithFrames(2);
		const close = vi.fn();
		vi.spyOn(globalThis, 'createImageBitmap').mockResolvedValue(
			/** @type {ImageBitmap} */ ({ width: 320, height: 180, close })
		);

		const result = await toWebp(source, { maxDimension: 100 });
		expect(result.blob).toBe(source);
		expect(result.mimeType).toBe('image/gif');
		expect(result.width).toBe(320);
		expect(result.height).toBe(180);
		expect(close).toHaveBeenCalledOnce();
	});
});

/**
 * Structurally valid enough for the animation parser: each frame has an
 * image descriptor followed by an empty image-data sub-block sequence.
 * Decoding is mocked in the integration test above because pixel validity is
 * the browser's responsibility, while this fixture isolates frame counting.
 * @param {number} count
 */
function gifWithFrames(count) {
	const bytes = [...new TextEncoder().encode('GIF89a'), 1, 0, 1, 0, 0, 0, 0];
	for (let i = 0; i < count; i++) {
		bytes.push(0x2c, 0, 0, 0, 0, 1, 0, 1, 0, 0, 2, 0);
	}
	bytes.push(0x3b);
	return new Blob([new Uint8Array(bytes)], { type: 'image/gif' });
}

function animatedWebpFixture() {
	return new Blob(
		[
			new Uint8Array([
				...new TextEncoder().encode('RIFF'),
				4,
				0,
				0,
				0,
				...new TextEncoder().encode('WEBP'),
				...new TextEncoder().encode('ANIM'),
				0,
				0,
				0,
				0
			])
		],
		{ type: 'image/webp' }
	);
}

describe('animation detection', () => {
	it('distinguishes a one-frame GIF from an animated GIF', async () => {
		expect(await isAnimatedImage(gifWithFrames(1))).toBe(false);
		expect(await isAnimatedImage(gifWithFrames(2))).toBe(true);
	});

	it('recognizes an animated WebP container', async () => {
		expect(await isAnimatedImage(animatedWebpFixture())).toBe(true);
	});

	it('does not inspect unrelated image formats as animations', async () => {
		expect(await isAnimatedImage(new Blob(['GIF89a'], { type: 'image/png' }))).toBe(false);
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

describe('preview assets survive the iframe sandbox', () => {
	// The preview frame has an opaque origin, so a blob URL from this document
	// cannot be fetched inside it. A data: URI carries its own bytes.
	it('encodes a blob as a data URI carrying its own mime type', async () => {
		const url = await toDataUrl(new Blob([new Uint8Array([1, 2, 3])], { type: 'image/webp' }));
		expect(url.startsWith('data:image/webp;base64,')).toBe(true);
		expect(url).toBe('data:image/webp;base64,' + btoa('\u0001\u0002\u0003'));
	});

	it('names a type even for a blob that has none', async () => {
		const url = await toDataUrl(new Blob([new Uint8Array([0])]));
		expect(url.startsWith('data:application/octet-stream;base64,')).toBe(true);
	});

	// String.fromCharCode(...arr) throws RangeError past the argument limit,
	// which a real cover would hit and a small fixture never would.
	it('encodes a blob larger than the argument limit without throwing', async () => {
		const url = await toDataUrl(new Blob([new Uint8Array(200_000)], { type: 'image/png' }));
		expect(url.length).toBeGreaterThan(200_000);
	});
});

describe('uploads are checked rather than trusted to the accept attribute', () => {
	/** @param {string} type @param {number} [size] */
	const file = (type, size = 10) => new Blob([new Uint8Array(size)], { type });

	it.each(ACCEPTED_IMAGE_TYPES)('accepts %s as an image', (type) => {
		expect(rejectionReason(file(type), 'image')).toBeNull();
	});

	it.each(ACCEPTED_AUDIO_TYPES)('accepts %s as audio', (type) => {
		expect(rejectionReason(file(type), 'audio')).toBeNull();
	});

	it('refuses SVG, which is the image type that can carry script', () => {
		expect(rejectionReason(file('image/svg+xml'), 'image')).toMatch(/not a supported/i);
	});

	it('refuses a file with no type at all', () => {
		expect(rejectionReason(file(''), 'image')).toMatch(/no recognizable/i);
	});

	it('refuses an image dressed as audio and vice versa', () => {
		expect(rejectionReason(file('image/png'), 'audio')).toMatch(/not a supported/i);
		expect(rejectionReason(file('audio/mpeg'), 'image')).toMatch(/not a supported/i);
	});

	it('refuses a file past its size ceiling and reports the real numbers', () => {
		const reason = rejectionReason(file('audio/mpeg', MAX_AUDIO_BYTES + 1), 'audio');
		expect(reason).toMatch(new RegExp(`limit is ${MAX_AUDIO_BYTES / 1024 / 1024} MB`));
		expect(rejectionReason(file('image/png', MAX_IMAGE_BYTES + 1), 'image')).toMatch(/limit is/);
	});

	it('accepts a file exactly at the ceiling', () => {
		expect(rejectionReason(file('image/png', MAX_IMAGE_BYTES), 'image')).toBeNull();
	});
});
