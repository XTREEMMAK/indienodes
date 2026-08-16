import { loadRing } from './ring.js';

/**
 * The ring, fetched once per session and shared by every surface that needs
 * it.
 *
 * Ring data used to be loaded in `+layout.js` *and* in each route's own
 * `+page.js`. SvelteKit deduped the fetch during prerendering but serialised
 * the response separately for each load function, so the whole ring was
 * embedded twice into each of four prerendered pages, plus shipped again as
 * `ring.json`: eight copies in the build. At five entries that was already
 * 38% of the home page's bytes, and it grows linearly with membership.
 *
 * Loading here instead means one fetch, one copy, cached by the browser
 * across reloads and shared across client-side navigation.
 *
 * It also fixes a freshness split that came with prerendering: baked-in data
 * meant the first paint showed the ring as of the last deploy while a later
 * client-side navigation showed it live, so a new member appeared or not
 * depending on how you arrived. Every surface reading from here sees the
 * live file.
 *
 * `/members` deliberately keeps its own server-side load and does not use
 * this: it is the page whose entire job is being crawlable and linking out,
 * which is most of what a webring is for, and rendering it only after
 * JavaScript would undercut that. One inlined copy there is a fair price.
 */

/**
 * Where the ring is read from. Defaults to the real one served at the site
 * root; `VITE_RING_URL` points it somewhere else without touching code,
 * which is how the 50-entry fixture in `testing/` gets exercised:
 *
 *   npm run dev:fixture
 *
 * Production builds set nothing and get `/ring.json`.
 *
 * Three accepted forms, and the third is the one that matters:
 *
 *   /ring.json                 same origin as the page (the default)
 *   http://host:port/path      used exactly as given
 *   :4174/ring.test.json       that port on *whatever host the page is on*
 *
 * The port-only form exists so exposing the dev server to the network
 * needs no reconfiguration. A hardcoded `http://localhost:4174` works only
 * on the machine running the servers: opened on a phone, `localhost` is the
 * phone, and the fetch fails. Inheriting `location.hostname` means the same
 * command works on localhost and over the LAN.
 */
const RAW_RING_URL = import.meta.env.VITE_RING_URL || '/ring.json';

/** Resolved lazily: `location` does not exist during SSR. */
function ringUrl() {
	if (RAW_RING_URL.startsWith(':')) {
		return `${location.protocol}//${location.hostname}${RAW_RING_URL}`;
	}
	return RAW_RING_URL;
}

function createRingStore() {
	/** @type {import('./ring.js').RingEntry[]} */
	let entries = $state([]);
	/** @type {'idle' | 'loading' | 'ready' | 'error'} */
	let status = $state('idle');

	/**
	 * The in-flight request, so concurrent callers share one fetch rather
	 * than racing. Plain, not reactive: nothing renders from it.
	 * @type {Promise<import('./ring.js').RingEntry[]> | null}
	 */
	let pending = null;

	return {
		get entries() {
			return entries;
		},
		get status() {
			return status;
		},
		/** True once a load has finished, successfully or not, so callers can stop showing a placeholder. */
		get settled() {
			return status === 'ready' || status === 'error';
		},

		/**
		 * Fetches the ring if it has not been fetched already. Safe to call
		 * from every consumer on mount; only the first call does work.
		 * @param {typeof fetch} [fetchFn]
		 */
		ensureLoaded(fetchFn = fetch) {
			if (pending) return pending;

			status = 'loading';
			pending = loadRing(fetchFn, ringUrl())
				.then((list) => {
					entries = list;
					status = 'ready';
					return list;
				})
				.catch((error) => {
					// Left empty rather than thrown onward: every consumer
					// already has an empty state, and a ring that failed to
					// load should degrade to "nothing to show" rather than an
					// error boundary over the whole app. `pending` is cleared
					// so a later navigation can retry.
					entries = [];
					status = 'error';
					pending = null;
					console.error('Failed to load ring.json:', error);
					return [];
				});

			return pending;
		}
	};
}

export const ringStore = createRingStore();
