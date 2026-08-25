#!/usr/bin/env node
/**
 * Swaps the published ring for the e2e ring, after the build, before preview.
 *
 * The end-to-end suite needs one entry of every type: a comic to open in the
 * viewer, a game with a `preview_url` to borrow the audio lane, a text entry
 * to read aloud, and two audio entries so "next" means something. The
 * published ring is not obliged to contain any of that. Until now it did,
 * because four placeholder members were carried in `members/` purely so the
 * tests had something to act on — which meant the ring could not be cleared
 * for launch without turning twelve tests red, and every real deploy shipped
 * four fictional creators pointing at `example.invalid`.
 *
 * This decouples the two. `members/` is now only real members; the fixture
 * below is only test data; neither constrains the other.
 *
 * **Why overwrite `build/ring.json` rather than set `VITE_RING_URL`.** That
 * variable exists and would work, but it is compiled into the bundle, so the
 * artifact under test would no longer be the artifact that ships — and
 * `scripts/verify-production-build.js` exists precisely because this project
 * has been bitten by dev/prod divergence before. Overwriting the data file
 * leaves the build byte-identical to production and changes only what it
 * fetches at runtime, which is what a fixture should change.
 *
 * No assets are copied. Every media URL in the fixture is under
 * `https://example.invalid/`, and the specs already intercept that origin
 * (see `route()` in ambient-media.e2e.js) to serve a synthetic tone and SVG.
 * The suite is hermetic: it makes no real network request for entry media.
 */
import { copyFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const FIXTURE = fileURLToPath(new URL('../ring.e2e.json', import.meta.url));

/**
 * Two targets, because `vite preview` does not serve `build/`.
 *
 * adapter-static writes the deployable artifact to `build/` — that is what the
 * Dockerfile copies to /srv and what Caddy serves. But SvelteKit's preview
 * server serves its own intermediate output directory instead, and static
 * assets there are copied from `static/` at build time. Seeding only `build/`
 * therefore looks like it worked (the file is right there, correct size) while
 * the preview keeps serving the published ring, which is a genuinely confusing
 * ten minutes if you have not hit it before.
 *
 * Both are written so the fixture applies whether the suite is pointed at the
 * preview server or at the real artifact.
 */
const TARGETS = [
	fileURLToPath(new URL('../../build/ring.json', import.meta.url)),
	fileURLToPath(new URL('../../.svelte-kit/output/client/ring.json', import.meta.url))
];

let seeded = 0;
for (const target of TARGETS) {
	try {
		await access(target);
	} catch {
		continue;
	}
	await copyFile(FIXTURE, target);
	seeded += 1;
}

if (seeded === 0) {
	console.error(
		'seed-e2e-ring: found no built ring.json to replace — run `npm run build` first.\n' +
			'This script replaces the built ring; it does not create the build.'
	);
	process.exit(1);
}

console.log(`seed-e2e-ring: seeded ${seeded} ring.json target(s) from testing/ring.e2e.json`);
