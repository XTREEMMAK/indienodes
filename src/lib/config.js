// Single source for external links, so they are not scattered through
// components. Replace the TODO values with the real URLs before launch.

export const GITHUB_URL = 'https://github.com/TODO/indienode-v2';
export const GITHUB_ISSUES_URL = `${GITHUB_URL}/issues`;
export const KOFI_URL = 'https://ko-fi.com/TODO';

/**
 * The deployed origin.
 *
 * Overridable with `VITE_SITE_ORIGIN`, matching how `VITE_RING_URL` already
 * works in `ringStore`, so there is one convention for "point this build
 * somewhere else" rather than two.
 *
 * **This is baked in at build time, not read at run time**, and that is not
 * an implementation detail to work around: `adapter-static` emits plain HTML
 * and JS with no server process, so there is nothing running that could read
 * an environment variable when a visitor arrives. In Docker terms that means
 * it belongs to `docker build` (an `ARG`/`ENV` before `npm run build`) and
 * setting it on `docker run` does nothing at all. See `.env.example`.
 *
 * The widget needs it most: it is embedded on third-party sites, so it cannot
 * fetch ring.json with a relative path (that would resolve against the host
 * page's origin, not this one).
 */
export const SITE_ORIGIN = import.meta.env.VITE_SITE_ORIGIN || 'https://indienodes.us';
export const RING_JSON_URL = `${SITE_ORIGIN}/ring.json`;
