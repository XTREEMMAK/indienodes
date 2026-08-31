import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

// Caddy sets these headers in production; the preview server this suite runs
// against does not, since it is plain `vite preview` with no Caddy in front
// of it (see playwright.config.js). Route interception applies the exact
// same header string Caddy would, against the exact same built HTML, so this
// is a real test of the policy rather than of Caddy's config syntax (which
// nothing in this repo's toolchain can validate -- there is no `caddy`
// binary in CI or this sandbox). It cannot replace validating the Caddyfile
// itself against a real Caddy instance before/at deploy.
const CADDYFILE = readFileSync(new URL('../Caddyfile', import.meta.url), 'utf8');

// Two Content-Security-Policy declarations exist, in file order: the
// site-wide baseline first, then /embed-frame's own stricter override.
const cspDeclarations = [...CADDYFILE.matchAll(/Content-Security-Policy "([^"]+)"/g)].map(
	(m) => m[1]
);
if (cspDeclarations.length !== 2) {
	throw new Error(
		`Expected exactly 2 Content-Security-Policy declarations in the Caddyfile (the site-wide ` +
			`baseline and /embed-frame's override), found ${cspDeclarations.length}. Update this test ` +
			'to match the Caddyfile structure.'
	);
}
const [MAIN_CSP, EMBED_FRAME_CSP] = cspDeclarations;

/**
 * Applies a CSP header to every navigation response and collects violations
 * via the real `securitypolicyviolation` event, not just console scraping --
 * that event fires for every kind of violation (including ones a browser
 * does not also log), and carries the exact blocked directive/URI.
 * @param {import('@playwright/test').Page} page
 * @param {string} csp
 */
async function withCsp(page, csp) {
	await page.addInitScript(() => {
		window.__cspViolations = [];
		document.addEventListener('securitypolicyviolation', (e) => {
			window.__cspViolations.push(`${e.violatedDirective}: ${e.blockedURI}`);
		});
	});
	// Only the top-level document response needs the header added -- CSP is
	// a per-document policy, and every sub-resource this suite cares about
	// (images, fonts, scripts) is governed by that one policy regardless of
	// its own response headers. Leaving every other request alone (rather
	// than re-fetching it here) matters concretely: the fixture ring embeds
	// deliberately unreachable `https://example.invalid/...` media URLs, and
	// re-fetching those through this handler throws instead of letting the
	// real browser fail them normally the way a live page would.
	await page.route('**/*', async (route) => {
		if (route.request().resourceType() !== 'document') return route.continue();
		const response = await route.fetch();
		await route.fulfill({
			response,
			headers: { ...response.headers(), 'content-security-policy': csp }
		});
	});
}

/** @param {import('@playwright/test').Page} page */
async function violations(page) {
	return page.evaluate(() => window.__cspViolations ?? []);
}

// A valid, pre-seeded draft, same shape join-editor-preview.e2e.js's own
// fixture uses: this suite is testing the CSP, not re-deriving the join
// form's own field-by-field validation, so skipping straight to a page that
// needs one avoids duplicating that flow.
const DRAFT = {
	creator: 'CSP Test',
	type: 'audio',
	why: 'A sufficiently detailed reason for joining this independent creator ring.',
	has_own_site: 'no',
	source_url: '',
	tags: ['experimental'],
	tracks: [],
	pages: [],
	excerpts: [''],
	thumb_url: '',
	thumb_position: { x: 50, y: 50 },
	preview_url: '',
	explicit: false
};

test.describe('the main-app Content-Security-Policy', () => {
	test('the field view loads images, audio metadata, and the ring with no violations', async ({
		page
	}) => {
		await withCsp(page, MAIN_CSP);
		await page.goto('/', { waitUntil: 'networkidle' });
		await expect(page.locator('.node').first()).toBeVisible({ timeout: 10000 });
		expect(await violations(page)).toEqual([]);
	});

	test('members, lists, and settings load with no violations', async ({ page }) => {
		await withCsp(page, MAIN_CSP);
		for (const path of ['/members', '/lists', '/settings']) {
			await page.goto(path, { waitUntil: 'networkidle' });
			expect(await violations(page), path).toEqual([]);
		}
	});

	test('the join flow (inline styles, uploads, the sandboxed preview) has no violations', async ({
		page
	}) => {
		await withCsp(page, MAIN_CSP);
		await page.addInitScript((entry) => {
			localStorage.setItem('indienode:submission-draft:v1', JSON.stringify(entry));
		}, DRAFT);
		await page.goto('/join', { waitUntil: 'networkidle' });
		await page.getByRole('button', { name: 'Start', exact: true }).click();
		await page.getByRole('button', { name: 'Continue', exact: true }).last().click();
		await page.getByRole('button', { name: 'Continue', exact: true }).last().click();
		await page.getByRole('button', { name: 'Continue', exact: true }).last().click();
		await expect(page.getByRole('heading', { name: 'Build your page' })).toBeVisible();
		await page.getByRole('button', { name: 'Open the editor' }).click();
		await expect(
			page.frameLocator('iframe[title="Live preview of your page"]').locator('body')
		).toBeVisible();
		expect(await violations(page)).toEqual([]);
	});

	test('the widget reference page (script tag + same-origin iframe) has no violations', async ({
		page
	}) => {
		await withCsp(page, MAIN_CSP);
		await page.goto('/widget', { waitUntil: 'networkidle' });
		await expect(page.locator('indienode-widget')).toBeVisible();
		// Not asserting into the nested iframe's own content here: that iframe
		// navigates to /embed-frame, a real cross-document load this same
		// route handler would (incorrectly, for this purpose) hand the
		// main-app CSP rather than /embed-frame's own -- already covered
		// correctly by the dedicated /embed-frame test below.
		expect(await violations(page)).toEqual([]);
	});
});

test.describe('the /embed-frame Content-Security-Policy', () => {
	test('the sandboxed widget target mounts and fetches ring.json with no violations', async ({
		page
	}) => {
		await withCsp(page, EMBED_FRAME_CSP);
		await page.goto('/embed-frame?site-id=audio-ashzone-xeno', { waitUntil: 'networkidle' });
		await expect(page.locator('indienode-widget')).toBeVisible();
		await expect(
			page.locator('indienode-widget').getByRole('region', { name: 'IndieNodes webring' })
		).toBeVisible();
		expect(await violations(page)).toEqual([]);
	});
});
