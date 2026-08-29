/**
 * Runs under the "client" vitest project (real `OffscreenCanvas`,
 * `createImageBitmap`, and now a real zip encode/decode round trip via
 * `jszip`) — see the same note in `draftDb.svelte.test.js` about why the
 * `.svelte.test.js` name matters here.
 */

import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { exportSite } from './zipExport.js';
import { deriveRingEntry } from './data.js';

/** @param {number} width @param {number} height */
async function fakeImage(width, height) {
	const canvas = new OffscreenCanvas(width, height);
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('no 2d context in test environment');
	ctx.fillStyle = '#336699';
	ctx.fillRect(0, 0, width, height);
	return canvas.convertToBlob({ type: 'image/png' });
}

describe('exportSite', () => {
	it('produces a zip with index.html, styles.css, script.js, and README.txt for a comic', async () => {
		const page1 = await fakeImage(300, 400);
		const icon = await fakeImage(64, 64);

		const { zip, filename, assetPaths } = await exportSite(
			{ type: 'comic', creator: 'Paper Lantern', why: 'A quiet ghost story.' },
			{
				displayName: 'Paper Lantern',
				works: [{ caption: 'Page one', file: page1 }],
				icon,
				socialLinks: [{ label: 'itch.io', url: 'https://example.com' }],
				templateId: 'panel-room',
				verificationToken: 'indienode-verify-test123'
			}
		);

		expect(filename).toBe('paper-lantern.zip');
		expect(assetPaths).toEqual({
			tracks: [],
			pages: ['assets/page-1.webp'],
			screenshot: null,
			icon: 'assets/icon.webp'
		});

		const unzipped = await JSZip.loadAsync(zip);
		expect(Object.keys(unzipped.files).sort()).toEqual(
			[
				'README.txt',
				'assets/',
				'assets/icon.webp',
				'assets/page-1.webp',
				'index.html',
				'script.js',
				'styles.css'
			].sort()
		);

		const html = await unzipped.file('index.html')?.async('string');
		expect(html).toContain('indienode-verify-test123');
		expect(html).toContain('assets/page-1.webp');
		expect(html).toContain('assets/icon.webp');
		expect(html).toContain('Paper Lantern');
	});

	it('copies an audio file byte-for-byte rather than running it through image processing', async () => {
		const fakeAudio = new Blob(['not-really-mp3-bytes'], { type: 'audio/mpeg' });

		const { zip } = await exportSite(
			{ type: 'audio', creator: 'Driftwood Radio', why: 'Tape hiss.' },
			{
				displayName: 'Driftwood Radio',
				works: [{ label: 'Low Tide', file: fakeAudio }],
				socialLinks: [],
				templateId: 'late-signal',
				verificationToken: 'indienode-verify-audio'
			}
		);

		const unzipped = await JSZip.loadAsync(zip);
		expect(Object.keys(unzipped.files)).toContain('assets/track-1.mp3');
		const bytes = await unzipped.file('assets/track-1.mp3')?.async('string');
		expect(bytes).toBe('not-really-mp3-bytes');

		const html = await unzipped.file('index.html')?.async('string');
		expect(html).toContain('assets/track-1.mp3');
		expect(html).toContain('Low Tide');
	});

	it('renders externally hosted audio URLs into the downloaded page', async () => {
		const mediaUrl = 'https://file.garden/example/should-i-stay.mp3';
		const { zip, assetPaths } = await exportSite(
			{
				type: 'audio',
				creator: 'Key Jay',
				why: 'VGM and more.',
				tracks: [{ label: 'Should I Stay', media_url: mediaUrl }]
			},
			{
				displayName: 'Key Jay',
				audioHosting: 'external',
				works: [],
				socialLinks: [],
				templateId: 'late-signal',
				verificationToken: 'indienode-verify-external-audio'
			}
		);

		expect(assetPaths.tracks).toEqual([]);
		const unzipped = await JSZip.loadAsync(zip);
		expect(Object.keys(unzipped.files)).not.toContain('assets/track-1.mp3');
		const html = await unzipped.file('index.html')?.async('string');
		expect(html).toContain(mediaUrl);
		expect(html).toContain('Should I Stay');
		expect(html).not.toContain('No tracks uploaded yet');
	});

	it('reuses entry.excerpts directly for text, with no generator-side duplicate', async () => {
		const { zip } = await exportSite(
			{
				type: 'text',
				creator: 'Loose Leaf',
				why: 'Essays.',
				excerpts: [{ text: 'The hiss was the point.' }]
			},
			{
				displayName: 'Loose Leaf',
				socialLinks: [],
				templateId: 'marginalia',
				verificationToken: 'indienode-verify-text'
			}
		);

		const unzipped = await JSZip.loadAsync(zip);
		const html = await unzipped.file('index.html')?.async('string');
		expect(html).toContain('The hiss was the point.');
	});

	it('handles a game with no screenshot uploaded yet without throwing', async () => {
		const { zip } = await exportSite(
			{ type: 'game', creator: 'Tin Roof', why: 'A puzzle game.' },
			{
				displayName: 'Tin Roof',
				works: [],
				socialLinks: [],
				templateId: 'cartridge',
				verificationToken: 'indienode-verify-game'
			}
		);
		const unzipped = await JSZip.loadAsync(zip);
		expect(Object.keys(unzipped.files)).not.toContain('assets/screenshot.webp');
		const html = await unzipped.file('index.html')?.async('string');
		expect(html).toContain('Tin Roof');
	});

	it('embeds the README with the display name and a note about the verification tag', async () => {
		const { zip } = await exportSite(
			{ type: 'text', creator: 'X', why: 'Y', excerpts: [{ text: 'Z' }] },
			{ displayName: 'X', templateId: 'marginalia', verificationToken: 'tok' }
		);
		const unzipped = await JSZip.loadAsync(zip);
		const readme = await unzipped.file('README.txt')?.async('string');
		expect(readme).toContain('X, generated by IndieNodes.');
		expect(readme).toMatch(/verification/i);
	});

	it('README states the provisional entry id when one is passed, and omits the line otherwise', async () => {
		const { zip: withId } = await exportSite(
			{ type: 'text', creator: 'X', why: 'Y', excerpts: [{ text: 'Z' }] },
			{
				displayName: 'X',
				templateId: 'marginalia',
				verificationToken: 'tok',
				provisionalId: 'text-x'
			}
		);
		const readmeWithId = await (await JSZip.loadAsync(withId)).file('README.txt')?.async('string');
		expect(readmeWithId).toContain('text-x');

		const { zip: withoutId } = await exportSite(
			{ type: 'text', creator: 'X', why: 'Y', excerpts: [{ text: 'Z' }] },
			{ displayName: 'X', templateId: 'marginalia', verificationToken: 'tok' }
		);
		const readmeWithoutId = await (
			await JSZip.loadAsync(withoutId)
		)
			.file('README.txt')
			?.async('string');
		expect(readmeWithoutId).not.toContain('provisional entry id');
	});

	it('exports uploaded Art works and their accessible metadata', async () => {
		const image = await fakeImage(900, 500);
		const { zip, assetPaths } = await exportSite(
			{ type: 'art', creator: 'Soft Orbit', why: 'Selected work.' },
			{
				displayName: 'Soft Orbit',
				works: [
					{
						file: image,
						alt: 'A violet landscape.',
						title: 'A Light Left On',
						medium: 'Digital gouache'
					}
				],
				templateId: 'quiet-gallery',
				verificationToken: 'indienode-verify-art'
			}
		);
		expect(assetPaths.pages).toEqual(['assets/page-1.webp']);
		const unzipped = await JSZip.loadAsync(zip);
		expect(Object.keys(unzipped.files)).toContain('assets/page-1.webp');
		const html = await unzipped.file('index.html')?.async('string');
		expect(html).toContain('A violet landscape.');
		expect(html).toContain('A Light Left On');
		expect(html).toContain('Digital gouache');
	});

	it('throws a clear error for a type with no registered template', async () => {
		await expect(
			exportSite({ type: 'sculpture', creator: 'X', why: 'Y' }, { displayName: 'X' })
		).rejects.toThrow(/no template/i);
	});
});

describe("deriveRingEntry, using a real exportSite run's own assetPaths", () => {
	// This is the guarantee assetPaths.js exists to make: whatever extension
	// an export actually wrote to the zip is the exact same extension the
	// derived ring.json media_url points at, because both come from one
	// export run's own output rather than two independent computations that
	// could disagree.
	it('audio: derives absolute media_url/label pairs from the actual exported paths', async () => {
		const audioFile = new Blob(['bytes'], { type: 'audio/mpeg' });
		const generator = {
			displayName: 'Driftwood Radio',
			works: [{ label: 'Low Tide', file: audioFile }],
			templateId: 'late-signal',
			verificationToken: 'tok'
		};
		const entry = { type: 'audio', creator: 'Driftwood Radio', why: 'Tape hiss.' };
		const { assetPaths } = await exportSite(entry, generator);

		const derived = deriveRingEntry(entry, generator.works, assetPaths, 'https://x.neocities.org/');
		expect(derived).toEqual({
			tracks: [{ label: 'Low Tide', media_url: 'https://x.neocities.org/assets/track-1.mp3' }]
		});
	});

	it('audio: derives thumb_url from an uploaded icon, since it is the only image a no-site audio creator has', async () => {
		const audioFile = new Blob(['bytes'], { type: 'audio/mpeg' });
		const icon = await fakeImage(64, 64);
		const generator = {
			displayName: 'Driftwood Radio',
			works: [{ label: 'Low Tide', file: audioFile }],
			icon,
			templateId: 'late-signal',
			verificationToken: 'tok'
		};
		const entry = { type: 'audio', creator: 'Driftwood Radio', why: 'Tape hiss.' };
		const { assetPaths } = await exportSite(entry, generator);

		const derived = deriveRingEntry(entry, generator.works, assetPaths, 'https://x.neocities.org');
		expect(derived.thumb_url).toBe('https://x.neocities.org/assets/icon.webp');
	});

	it('audio: no thumb_url at all when no icon was uploaded', async () => {
		const audioFile = new Blob(['bytes'], { type: 'audio/mpeg' });
		const generator = {
			displayName: 'Driftwood Radio',
			works: [{ label: 'Low Tide', file: audioFile }],
			templateId: 'late-signal',
			verificationToken: 'tok'
		};
		const entry = { type: 'audio', creator: 'Driftwood Radio', why: 'Tape hiss.' };
		const { assetPaths } = await exportSite(entry, generator);

		const derived = deriveRingEntry(entry, generator.works, assetPaths, 'https://x.neocities.org');
		expect(derived).not.toHaveProperty('thumb_url');
	});

	it("audio: derives no tracks key at all when nothing was bundled, so a creator's own typed URLs survive", async () => {
		// The regression this guards: `bindSourceUrl` does
		// `Object.assign(entry, deriveRingEntry(...))`. A no-site audio creator
		// who chooses to host the file separately (JoinMediaStep's
		// `audioHosting === 'external'` branch) types real URLs straight into
		// `entry.tracks` — no work file is ever uploaded for that choice, so
		// `assetPaths.tracks` comes back empty. Returning `tracks: []`
		// unconditionally here would let that Object.assign wipe the typed
		// URLs the instant the creator verified their generated page. Revert
		// the `assetPaths.tracks.length` guard in data.js and this fails.
		const generator = {
			displayName: 'Driftwood Radio',
			works: [],
			templateId: 'late-signal',
			verificationToken: 'tok'
		};
		const entry = {
			type: 'audio',
			creator: 'Driftwood Radio',
			why: 'Tape hiss.',
			tracks: [{ label: 'Hand-typed', media_url: 'https://filegarden.com/creator/track.mp3' }]
		};
		const { assetPaths } = await exportSite(entry, generator);

		const derived = deriveRingEntry(entry, generator.works, assetPaths, 'https://x.neocities.org');
		expect(derived).not.toHaveProperty('tracks');
		expect(entry.tracks).toEqual([
			{ label: 'Hand-typed', media_url: 'https://filegarden.com/creator/track.mp3' }
		]);
	});

	it('comic: carries the caption through and drops it when blank', async () => {
		const page1 = await fakeImage(200, 300);
		const page2 = await fakeImage(200, 300);
		const generator = {
			displayName: 'Paper Lantern',
			works: [
				{ caption: 'The lantern flickers.', file: page1 },
				{ caption: '', file: page2 }
			],
			templateId: 'panel-room',
			verificationToken: 'tok'
		};
		const entry = { type: 'comic', creator: 'Paper Lantern', why: 'Ghosts.' };
		const { assetPaths } = await exportSite(entry, generator);

		const derived = deriveRingEntry(entry, generator.works, assetPaths, 'https://x.neocities.org');
		expect(derived.pages).toEqual([
			{ image_url: 'https://x.neocities.org/assets/page-1.webp', caption: 'The lantern flickers.' },
			{ image_url: 'https://x.neocities.org/assets/page-2.webp' }
		]);
		expect(derived.pages[1]).not.toHaveProperty('caption');
	});

	it('game: derives thumb_url from the screenshot path, normalizing a trailing slash', async () => {
		const shot = await fakeImage(400, 300);
		const generator = {
			displayName: 'Tin Roof',
			works: [{ file: shot }],
			templateId: 'cartridge',
			verificationToken: 'tok'
		};
		const entry = { type: 'game', creator: 'Tin Roof', why: 'A puzzle.' };
		const { assetPaths } = await exportSite(entry, generator);

		const derived = deriveRingEntry(entry, generator.works, assetPaths, 'https://x.neocities.org/');
		expect(derived).toEqual({ thumb_url: 'https://x.neocities.org/assets/screenshot.webp' });
	});

	it('game with no screenshot derives no thumb_url at all', () => {
		const entry = { type: 'game' };
		const derived = deriveRingEntry(
			entry,
			[],
			{ tracks: [], pages: [], screenshot: null, icon: null },
			'https://x.neocities.org'
		);
		expect(derived).toEqual({});
	});

	it('text without a cover derives nothing: entry.excerpts was already the real value', () => {
		const derived = deriveRingEntry(
			{ type: 'text' },
			[],
			{ tracks: [], pages: [], screenshot: null, icon: null },
			'https://x.neocities.org'
		);
		expect(derived).toEqual({});
	});

	it.each(['comic', 'text'])('%s: derives the Entry cover from the exported icon', (type) => {
		const derived = deriveRingEntry(
			{ type },
			[],
			{ tracks: [], pages: [], screenshot: null, icon: 'assets/icon.webp' },
			'https://x.neocities.org/'
		);
		expect(derived.thumb_url).toBe('https://x.neocities.org/assets/icon.webp');
	});

	it('game: a dedicated Entry cover takes priority over a work screenshot', () => {
		const derived = deriveRingEntry(
			{ type: 'game' },
			[],
			{
				tracks: [],
				pages: [],
				screenshot: 'assets/screenshot.webp',
				icon: 'assets/icon.webp'
			},
			'https://x.neocities.org'
		);
		expect(derived).toEqual({ thumb_url: 'https://x.neocities.org/assets/icon.webp' });
	});
	it('art: derives the public artworks array from the files the export wrote', async () => {
		const image = await fakeImage(900, 500);
		const generator = {
			displayName: 'Soft Orbit',
			works: [
				{
					file: image,
					alt: 'A violet landscape.',
					title: 'A Light Left On',
					year: '2026',
					medium: 'Digital gouache',
					external_url: 'https://artist.example/work'
				}
			],
			templateId: 'quiet-gallery',
			verificationToken: 'tok'
		};
		const entry = { type: 'art', creator: 'Soft Orbit', why: 'Selected work.' };
		const { assetPaths } = await exportSite(entry, generator);

		const derived = deriveRingEntry(entry, generator.works, assetPaths, 'https://artist.example/');
		expect(derived).toEqual({
			artworks: [
				{
					image_url: 'https://artist.example/assets/page-1.webp',
					alt: 'A violet landscape.',
					title: 'A Light Left On',
					year: '2026',
					medium: 'Digital gouache',
					external_url: 'https://artist.example/work'
				}
			]
		});
	});
});
