// Single source for external links, so they are not scattered through
// components. Replace the TODO values with the real URLs before launch.

export const GITHUB_URL = 'https://github.com/XTREEMMAK/indienodes';
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

/**
 * Where the submission form posts.
 *
 * **Named for the shape, not the vendor.** It is an n8n workflow today (see
 * `docs/decisions.md`), and the site's entire half of that contract is "POST
 * JSON to a URL, read JSON back." Encoding "n8n" into the variable name would
 * make replacing it a rename across the code, `.env.example`, the Dockerfile,
 * and the publish workflow, in exchange for nothing at the call site.
 *
 * Build-time, for the same reason as `SITE_ORIGIN` above, with the same Docker
 * consequence: `--build-arg`, not `docker run -e`.
 *
 * **Unset is a supported state and means two different things.** In dev it
 * selects the mock backend, so the form is workable without running n8n. In a
 * production build it means submissions are closed, and the form says so
 * rather than pretending to accept anything. `submissionApi.js` owns that
 * distinction; the difference matters enough that it is not left to a falsy
 * check at the call site.
 *
 * The URL is public: it ships inside the client bundle, because a static site
 * has no server to proxy through. It is not a credential and must not be
 * treated as one. Every abuse control lives on the receiving end.
 */
export const SUBMISSION_WEBHOOK_URL = import.meta.env.VITE_SUBMISSION_WEBHOOK_URL || '';
