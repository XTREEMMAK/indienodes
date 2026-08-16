#!/usr/bin/env node
// Regenerates testing/fixtures/ring.test.json at a size worth testing
// against: 50 entries, rather than the seven it takes to prove each type
// renders at all.
//
// Fifty is chosen to exercise the things a small fixture cannot:
//
//   - **Rotation actually rotates.** With more entries than nodes, every
//     node has somewhere to go, so shuffled-deck selection, the no-repeat
//     guarantee, and the duplicate-avoidance across nodes all get exercised.
//   - **Selection is visibly random.** At seven entries two visitors look
//     similar by coincidence; at fifty, a shared first screen would be a bug
//     you could actually see.
//   - **The tag filter has something to filter.** Settings lists every tag
//     in the ring, which is a one-line list at seven entries.
//   - **Link-only audio is represented**, since that is now a supported
//     shape and not an error.
//
// The seven hand-written entries are preserved exactly: three real
// third-party sources and four local fixture sites with real verification
// tokens. Everything after them is generated filler, marked `_placeholder`
// so it is never mistaken for a real submission.
//
// Deterministic: same input, same output, so regenerating does not churn
// the file. Run from the project root:
//   node testing/scripts/generate-fixture.mjs

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const FIXTURE_PATH = fileURLToPath(new URL('../fixtures/ring.test.json', import.meta.url));
const COVERS_DIR = fileURLToPath(new URL('../sites/covers/', import.meta.url));
const LOCAL = 'http://localhost:4174';
const TARGET_TOTAL = 50;

/** The hand-written entries to keep, by id and in this order. */
const KEEP = [
	'test-audio-ashzone-xeno',
	'test-text-keyjay',
	'test-game-dinoblade',
	'test-audio-driftwood-radio',
	'test-comic-paper-lantern',
	'test-text-loose-leaf',
	'test-game-tin-roof'
];

// A small deterministic PRNG, so "random-looking" filler is stable across
// runs. Regenerating should produce no diff unless the inputs changed.
function mulberry32(seed) {
	return function next() {
		seed |= 0;
		seed = (seed + 0x6d2b79f5) | 0;
		let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}
const rand = mulberry32(20260815);
const pick = (list) => list[Math.floor(rand() * list.length)];

const COVER_PALETTES = [
	['#3b82f6', '#1e3a8a'],
	['#a855f7', '#581c87'],
	['#f59e0b', '#78350f'],
	['#22c55e', '#14532d'],
	['#ec4899', '#831843'],
	['#06b6d4', '#164e63'],
	['#ef4444', '#7f1d1d'],
	['#8b5cf6', '#4c1d95']
];

/** Flat two-tone covers, generated so the fixture needs no third-party image host. */
function writeCovers() {
	mkdirSync(COVERS_DIR, { recursive: true });
	COVER_PALETTES.forEach(([from, to], i) => {
		const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" width="600" height="600">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/>
  </linearGradient></defs>
  <rect width="600" height="600" fill="url(#g)"/>
  <circle cx="${140 + i * 40}" cy="${420 - i * 30}" r="${90 + i * 12}" fill="#ffffff" fill-opacity="0.12"/>
  <text x="300" y="320" text-anchor="middle" font-family="sans-serif" font-size="180" font-weight="700" fill="#ffffff" fill-opacity="0.22">${i + 1}</text>
</svg>
`;
		writeFileSync(new URL(`cover-${i + 1}.svg`, `file://${COVERS_DIR}`), svg);
	});
	return COVER_PALETTES.map((_, i) => `${LOCAL}/covers/cover-${i + 1}.svg`);
}

const CREATORS = [
	'Fernbank Tapes',
	'Halo Nine',
	'Quiet Machines',
	'Bitter Orange',
	'North Pylon',
	'Sable & Co',
	'Little Rift',
	'Cassette Sunday',
	'Moth Season',
	'Ivory Deck',
	'Slate Harbour',
	'Paper Cranes',
	'Verdigris',
	'Nine Volt',
	'Harrow Lane',
	'Blue Ridge Press',
	'Tin Whistle',
	'Glass Meadow',
	'Ember & Ash',
	'Long Division'
];
const ADJ = [
	'Slow',
	'Quiet',
	'Bright',
	'Hollow',
	'Amber',
	'Distant',
	'Paper',
	'Iron',
	'Soft',
	'Late'
];
const NOUN = [
	'Signal',
	'Harbour',
	'Machine',
	'Garden',
	'Circuit',
	'Winter',
	'Letter',
	'Engine',
	'Field',
	'Chorus'
];

const TAGS = {
	audio: ['ambient', 'lo-fi', 'synth', 'dnb', 'folk', 'jazz', 'shoegaze', 'field-recording'],
	comic: ['slice-of-life', 'black-and-white', 'sci-fi', 'watercolour', 'webcomic', 'horror'],
	text: ['essay', 'fiction', 'poetry', 'food-writing', 'memoir', 'criticism'],
	game: ['puzzle', 'solo-dev', 'platformer', 'narrative', 'roguelike', 'pixel-art']
};

const WHY = {
	audio: [
		'A short set that never raises its voice.',
		'Built from tape hiss and patience.',
		'Three tracks, no filler.',
		'Recorded in one room over one winter.'
	],
	comic: [
		'Drawn in the margins of a day job.',
		'A quiet story about a loud year.',
		'Six pages, no dialogue.',
		'Ink and a lot of coffee.'
	],
	text: [
		'One long paragraph that earns its length.',
		'Notes on a place that no longer exists.',
		'Short, and worth the four minutes.',
		'An essay that changes its mind halfway.'
	],
	game: [
		'Small, finished, and completely its own thing.',
		'One mechanic, explored properly.',
		'Made by one person over two years.',
		'Twenty minutes, and it stays with you.'
	]
};

/**
 * Every adjective-noun pairing, shuffled once and dealt without replacement.
 *
 * Picking each word independently collided: eleven titles were duplicated
 * across the fifty entries, and two cards showing "Late Signal" side by side
 * reads as the duplicate-avoidance being broken when it is working
 * perfectly. A fixture whose job is making behaviour legible should not
 * manufacture false symptoms.
 */
function uniqueTitles(count) {
	const all = ADJ.flatMap((a) => NOUN.map((n) => `${a} ${n}`));
	for (let i = all.length - 1; i > 0; i -= 1) {
		const j = Math.floor(rand() * (i + 1));
		[all[i], all[j]] = [all[j], all[i]];
	}
	if (count > all.length) throw new Error(`Need ${count} titles, only ${all.length} combinations.`);
	return all.slice(0, count);
}

const covers = writeCovers();
const existing = JSON.parse(readFileSync(FIXTURE_PATH, 'utf-8'));
const kept = KEEP.map((id) => existing.find((e) => e.id === id)).filter(Boolean);

// The XENO entry gets local files instead of Bandcamp's expiring URLs, so
// the fixture keeps working past the ~24h token life and so its audio is
// served with CORS (which is what lets it exercise the analyser).
const xeno = kept.find((e) => e.id === 'test-audio-ashzone-xeno');
if (xeno) {
	xeno.tracks = [
		{ label: 'LOGIN', media_url: `${LOCAL}/ashzone/audio/login.mp3` },
		{ label: 'XENO', media_url: `${LOCAL}/ashzone/audio/xeno.mp3` },
		{ label: 'Lock ON(LINE)', media_url: `${LOCAL}/ashzone/audio/lock-online.mp3` }
	];
	xeno.why =
		'Real Bandcamp release: a 3-track EDM/DnB EP, served locally so it plays offline and with CORS.';
}

const TYPES = ['audio', 'comic', 'text', 'game'];
const titles = uniqueTitles(TARGET_TOTAL - kept.length);
const generated = [];
let n = 0;
while (kept.length + generated.length < TARGET_TOTAL) {
	const type = TYPES[n % TYPES.length];
	const creator = CREATORS[n % CREATORS.length];
	const title = titles[n];
	const slug = `gen-${type}-${String(n + 1).padStart(2, '0')}`;
	// A quarter of entries have no cover, so the flat colour-wash card and the
	// no-image metadata gradient stay on screen and keep getting looked at.
	const cover = n % 4 === 3 ? null : covers[n % covers.length];

	/** @type {Record<string, unknown>} */
	const entry = {
		id: slug,
		creator,
		type,
		title,
		why: pick(WHY[type]),
		source_url: `https://example.invalid/${slug}`,
		tags: [pick(TAGS[type]), pick(TAGS[type])].filter((t, i, a) => a.indexOf(t) === i),
		verification_token: 'placeholder-token-not-real',
		_placeholder: true
	};
	if (cover) entry.thumb_url = cover;

	if (type === 'audio') {
		// Every third audio entry is link-only, which is now a supported shape
		// (see docs/decisions.md) and needs to appear in a realistic fixture.
		if (n % 3 !== 0) {
			entry.tracks = [
				{ label: 'Side A', media_url: `${LOCAL}/driftwood-radio/harbor-light.wav` },
				{ label: 'Side B', media_url: `${LOCAL}/driftwood-radio/static-tide.wav` }
			];
		}
	} else if (type === 'comic') {
		entry.pages = [1, 2, 3].map((p) => ({
			image_url: `${LOCAL}/paper-lantern-comics/pages/page-0${p}.svg`,
			caption: `Page ${p}`
		}));
	} else if (type === 'text') {
		entry.excerpt =
			'The building had been three things before it was this, and the sign for the second one was still bolted above the door, painted over twice and legible anyway.';
	} else if (type === 'game') {
		entry.thumb_url = entry.thumb_url ?? covers[n % covers.length];
	}

	generated.push(entry);
	n += 1;
}

const ring = [...kept, ...generated];
writeFileSync(FIXTURE_PATH, JSON.stringify(ring, null, '\t') + '\n');

const byType = ring.reduce((acc, e) => ({ ...acc, [e.type]: (acc[e.type] ?? 0) + 1 }), {});
const playable = ring.filter((e) => e.type === 'audio' && e.tracks?.length).length;
const linkOnly = ring.filter((e) => e.type === 'audio' && !e.tracks?.length).length;
console.log(`wrote ${ring.length} entries to testing/fixtures/ring.test.json`);
console.log('  by type:', byType);
console.log(`  audio: ${playable} playable, ${linkOnly} link-only`);
console.log(`  covers: ${covers.length} generated in testing/sites/covers/`);
