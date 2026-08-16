#!/usr/bin/env node
// Downloads AshZone's XENO tracks to a local folder so the fixture has real
// music to test the player against, instead of generated sine tones.
//
// Why local files rather than the Bandcamp URLs the fixture used to carry:
// those URLs expire in about a day (the `ts` query parameter is the expiry;
// an expired one returns 410), so a fixture built on them stops working
// overnight. A downloaded copy does not, and being served from the local
// test server it also arrives with `Access-Control-Allow-Origin: *`, which
// is what lets it exercise the queue, finish detection, and the reactive
// background all at once. Bandcamp's own CDN sends no CORS header, so the
// remote URLs could never test that path.
//
// **The downloaded files are gitignored and must stay that way.** They are
// someone else's music. Committing them would be redistribution, which is
// exactly the thing docs/decisions.md rules out for the product itself; a
// local dev convenience does not get a different answer. Anyone who needs
// them runs this script.
//
// Requires the `playwright` devDependency at the project root, since
// Bandcamp blocks plain HTTP clients and a real browser engine gets through.
// Run from the project root: node testing/scripts/fetch-xeno-audio.mjs

import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ALBUM_URL = 'https://ashzonemusic.bandcamp.com/album/xeno';
const OUT_DIR = fileURLToPath(new URL('../sites/ashzone/audio/', import.meta.url));

/** Filenames the fixture expects, keyed by Bandcamp's own track title. */
const FILENAMES = new Map([
	['LOGIN', 'login.mp3'],
	['XENO', 'xeno.mp3'],
	['Lock ON(LINE)', 'lock-online.mp3']
]);

const browser = await chromium.launch();
const page = await browser.newPage({
	userAgent:
		'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'
});

await page.goto(ALBUM_URL, { waitUntil: 'domcontentloaded', timeout: 25000 });
await page.waitForTimeout(1500);

const tralbumJson = await page.evaluate(() => {
	const el = document.querySelector('[data-tralbum]');
	return el ? el.getAttribute('data-tralbum') : null;
});

if (!tralbumJson) {
	await browser.close();
	console.error('Could not find Bandcamp track data on the page. Layout may have changed.');
	process.exit(1);
}

const tralbum = JSON.parse(tralbumJson);
await mkdir(OUT_DIR, { recursive: true });

let written = 0;
for (const track of tralbum.trackinfo ?? []) {
	const filename = FILENAMES.get(track.title);
	const url = track.file?.['mp3-128'];
	if (!filename) {
		console.warn(`Skipping unrecognised track "${track.title}".`);
		continue;
	}
	if (!url) {
		console.warn(`No streamable file for "${track.title}"; it may not be free to stream.`);
		continue;
	}

	// Downloaded outside the browser. The token is carried in the URL itself,
	// so a plain request works and is far cheaper than streaming megabytes
	// through an evaluate() call. An in-page fetch is not an option anyway:
	// bcbits sends no CORS header, so the browser blocks reading the body
	// even from a bandcamp.com page. Only the album page needs the browser,
	// because that is what is bot-protected.
	const response = await fetch(url);
	if (!response.ok) {
		console.warn(`Download failed for "${track.title}": HTTP ${response.status}`);
		continue;
	}
	const bytes = Buffer.from(await response.arrayBuffer());

	await writeFile(new URL(filename, `file://${OUT_DIR}`), bytes);
	console.log(`wrote ${filename} (${(bytes.length / 1024 / 1024).toFixed(1)} MB)`);
	written += 1;
}

await browser.close();

if (written === 0) {
	console.error('No audio written.');
	process.exit(1);
}
console.log(`\nDone: ${written} track(s) in testing/sites/ashzone/audio/ (gitignored).`);
console.log('Serve them with: node testing/scripts/serve.mjs');
