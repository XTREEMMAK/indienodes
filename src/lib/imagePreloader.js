import { browser } from '$app/environment';

/**
 * Warms a node's cover image before it is swapped into view, so a rotation
 * lands on an already-decoded image instead of flashing an empty card.
 *
 * Deliberately narrow in scope: this preloads *images* and nothing else.
 * There is no data-prefetch layer here because there is nothing to prefetch.
 * `ring.json` is fetched once, in full, by the field view's `+page.js` load
 * function, so every entry's metadata is already in memory client-side and a
 * node swap costs zero requests for data. The image is the only per-swap
 * network cost, which is why it is the only thing warmed.
 *
 * Concurrency is capped rather than firing everything at once. Independent
 * per-node timers already spread swaps out on their own (that is most of why
 * they replaced the single global timer, which swapped every visible node at
 * the same instant), but jitter is random, so several slots can still line up
 * occasionally. The cap keeps that worst case from turning into a burst.
 */

/** Simultaneous in-flight preloads. Low on purpose: warming is background work. */
const MAX_CONCURRENT = 3;

/** URLs already fetched and decoded. Never warmed twice. */
const warmed = new Set();

/** @type {Map<string, Promise<void>>} URL -> in-flight load, so callers share one. */
const inFlight = new Map();

/** @type {(() => void)[]} */
const queue = [];
let active = 0;

function pump() {
	while (active < MAX_CONCURRENT && queue.length > 0) {
		const run = queue.shift();
		run?.();
	}
}

/**
 * Fetches and decodes one image. Settles either way: a failed preload is not
 * an error worth propagating, since the swap still proceeds and FieldNode
 * already falls back to its color wash when an image fails to load.
 * @param {string} url
 * @returns {Promise<void>}
 */
function load(url) {
	return new Promise((/** @type {() => void} */ settle) => {
		const img = new Image();
		img.decoding = 'async';

		const done = () => {
			warmed.add(url);
			settle();
		};

		img.onload = () => {
			// decode() resolves once the bitmap is ready to paint, which is the
			// part that actually prevents a hitch on swap. Not universally
			// available and can reject on its own, so onload is the floor.
			if (typeof img.decode === 'function') {
				img.decode().then(done, done);
			} else {
				done();
			}
		};
		img.onerror = () => settle();

		img.src = url;
	});
}

/**
 * Warms an image URL, at most once, respecting the concurrency cap.
 * Safe to call with a falsy URL (entries without cover art) and safe to call
 * during SSR, where it is a no-op.
 * @param {string | null | undefined} url
 * @returns {Promise<void>}
 */
export function preload(url) {
	if (!browser || !url) return Promise.resolve();
	if (warmed.has(url)) return Promise.resolve();

	const existing = inFlight.get(url);
	if (existing) return existing;

	/** @type {Promise<void>} */
	const promise = new Promise((/** @type {() => void} */ settle) => {
		queue.push(() => {
			active += 1;
			load(url).then(() => {
				active -= 1;
				inFlight.delete(url);
				settle();
				pump();
			});
		});
		pump();
	});

	inFlight.set(url, promise);
	return promise;
}

/**
 * Whether a URL has already been warmed, so a caller can skip a swap delay it
 * would otherwise take to wait on one.
 * @param {string | null | undefined} url
 */
export function isWarm(url) {
	return !url || warmed.has(url);
}
