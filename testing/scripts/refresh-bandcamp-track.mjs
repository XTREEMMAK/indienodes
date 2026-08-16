#!/usr/bin/env node
// Bandcamp's streaming URLs are tokenized and expire, so they cannot be
// committed once and stay usable. Measured: the `ts` query parameter is the
// expiry, the window is roughly 24 hours, and an expired URL returns 410. This re-scrapes AshZone's
// XENO album page (the same real, publicly playable release used in
// ring.test.json) and writes fresh media_url values into the fixture.
//
// Requires the `playwright` devDependency already installed at the project
// root (this script is run from there, not as its own package).

import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const FIXTURE_URL = new URL('../fixtures/ring.test.json', import.meta.url);
const ALBUM_URL = 'https://ashzonemusic.bandcamp.com/album/xeno';

const browser = await chromium.launch();
const page = await browser.newPage({
	userAgent:
		'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'
});

await page.goto(ALBUM_URL, { waitUntil: 'networkidle', timeout: 20000 });
await page.waitForTimeout(1500);

const tralbumJson = await page.evaluate(() => {
	const el = document.querySelector('[data-tralbum]');
	return el ? el.getAttribute('data-tralbum') : null;
});
await browser.close();

if (!tralbumJson) {
	console.error('Could not find Bandcamp track data on the page. Layout may have changed.');
	process.exit(1);
}

const tralbum = JSON.parse(tralbumJson);
/** @type {Map<string, string>} */
const urlsByTitle = new Map(
	tralbum.trackinfo.map((track) => [track.title, track.file?.['mp3-128']])
);

const ring = JSON.parse(readFileSync(FIXTURE_URL, 'utf-8'));
const entry = ring.find((e) => e.id === 'test-audio-ashzone-xeno');

if (!entry) {
	console.error('test-audio-ashzone-xeno not found in ring.test.json.');
	process.exit(1);
}

let updated = 0;
for (const track of entry.tracks) {
	const fresh = urlsByTitle.get(track.label);
	if (fresh) {
		track.media_url = fresh;
		updated++;
	} else {
		console.warn(`No matching Bandcamp track found for label "${track.label}".`);
	}
}

writeFileSync(FIXTURE_URL, JSON.stringify(ring, null, 2) + '\n');
console.log(`Refreshed ${updated} track URL(s) in ring.test.json.`);
