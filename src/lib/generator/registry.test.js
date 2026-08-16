/**
 * The durable half of "does every template actually fill in every token."
 * The interactive `npm run generator:preview` tool only catches a leftover
 * `{{TOKEN}}` if someone opens the page and looks; this catches it on every
 * `test:unit` run instead — a missing fixture key or a typo'd token in a
 * `shell.html` fails here regardless of whether anyone remembered to check.
 *
 * No DOM or IndexedDB needed (this is plain string output), so this file is
 * deliberately named without the `.svelte.` infix the rest of the generator
 * suite uses (`draftDb.svelte.test.js` etc., which need real browser APIs):
 * see vite.config.js's `test.projects` — routing is filename-based, and
 * this runs faster under the "server" project's plain Node environment.
 *
 * `TOKEN_PATTERN` is the exact same shape `fill()` itself matches on in
 * `templates/shared.js`, not a hand-approximated copy — so this test can't
 * quietly drift from what "unfilled" actually means there.
 */

import { describe, expect, it } from 'vitest';
import { TEMPLATES } from './registry.js';
import { FIXTURES } from './templates/fixtures.js';

const TOKEN_PATTERN = /\{\{\w+\}\}/;

describe('every generator template fills in every token', () => {
	for (const [type, entries] of Object.entries(TEMPLATES)) {
		for (const entry of entries) {
			it(`${type}/${entry.id} leaves no {{token}} unfilled`, () => {
				const data = FIXTURES[/** @type {keyof typeof FIXTURES} */ (type)];
				const { html, css, js } = entry.render(data);
				expect(html).not.toMatch(TOKEN_PATTERN);
				expect(css).not.toMatch(TOKEN_PATTERN);
				expect(js).not.toMatch(TOKEN_PATTERN);
			});
		}
	}
});
