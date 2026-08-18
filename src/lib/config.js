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

/**
 * Where `/contact` posts. A **separate** variable from
 * `SUBMISSION_WEBHOOK_URL` rather than one more `action` on that same
 * webhook, on purpose: Contact and the review pipeline are independent
 * concerns that should be pausable independently (a maintainer closing
 * intake for a while has no reason to also go silent on Contact), and a
 * stateless fire-and-forget message has no business sharing a URL with
 * `issue_token`/`verify`'s stateful multi-step contract.
 *
 * Same posture as `SUBMISSION_WEBHOOK_URL` in every other respect: public,
 * build-time only, unset means dev mocks and prod says the form is closed.
 */
export const CONTACT_WEBHOOK_URL = import.meta.env.VITE_CONTACT_WEBHOOK_URL || '';

/**
 * Cloudflare Turnstile site key, read by `Turnstile.svelte` and rendered on
 * `/update` and `/contact` — the two forms this was added ahead of.
 *
 * Only the site key lives here, and only the site key ever will: it is
 * public by design (Turnstile's own widget ships it to the browser to
 * render the challenge). The matching secret key is what actually calls
 * Cloudflare's siteverify API to check a token, which is a server-side
 * call this static site has nowhere to make — same reasoning as
 * `SUBMISSION_WEBHOOK_URL` above. That verification belongs in the
 * external n8n workflow(s) this app hands submissions to, not in this
 * codebase.
 *
 * Empty is a supported state: `Turnstile.svelte` renders nothing when this
 * is empty rather than rendering a widget pointed at nothing, the same
 * "unset means off, not broken" posture `SUBMISSION_WEBHOOK_URL` already
 * has.
 */
export const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY || '';
