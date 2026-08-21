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
import { TEMPLATES, loadTemplate } from './registry.js';
import { FIXTURES, LONG_FIXTURES } from './templates/fixtures.js';

const TOKEN_PATTERN = /\{\{\w+\}\}/;

/**
 * @param {string} type
 * @param {string} id
 * @param {import('./templates/shared.js').GeneratorData} data
 */
async function renderTemplate(type, id, data) {
	const template = await loadTemplate(type, id);
	if (!template) throw new Error(`Test template "${type}/${id}" was not found.`);
	return template.render(data);
}

describe('every generator type exposes four distinct templates', () => {
	const originalIds = {
		audio: 'late-signal',
		comic: 'panel-room',
		text: 'marginalia',
		game: 'cartridge'
	};

	for (const [type, entries] of Object.entries(TEMPLATES)) {
		it(`${type} has four template options with the original default first`, async () => {
			const data = FIXTURES[/** @type {keyof typeof FIXTURES} */ (type)];
			const loaded = await Promise.all(entries.map((entry) => loadTemplate(type, entry.id)));
			const outputs = loaded.map((entry) => JSON.stringify(entry?.render(data)));
			expect(entries).toHaveLength(4);
			expect(entries[0].id).toBe(originalIds[/** @type {keyof typeof originalIds} */ (type)]);
			expect(new Set(entries.map((entry) => entry.id))).toHaveLength(entries.length);
			expect(new Set(entries.map((entry) => entry.label))).toHaveLength(entries.length);
			expect(new Set(outputs)).toHaveLength(entries.length);
			expect(entries.every((entry) => !('render' in entry))).toBe(true);
		});
	}
});

describe('the restored original remains the default for each type', () => {
	const expectations = {
		audio: 'class="hero-name"',
		comic: 'class="masthead"',
		text: 'class="excerpt"',
		game: 'class="poster'
	};

	for (const [type, marker] of Object.entries(expectations)) {
		it(`${type} defaults to the restored original layout`, async () => {
			const data = FIXTURES[/** @type {keyof typeof FIXTURES} */ (type)];
			const entries = TEMPLATES[/** @type {keyof typeof TEMPLATES} */ (type)];
			const { html } = await renderTemplate(type, entries[0].id, data);
			expect(html).toContain(marker);
		});
	}
});

describe('every generator template fills in every token', () => {
	for (const [type, entries] of Object.entries(TEMPLATES)) {
		for (const entry of entries) {
			it(`${type}/${entry.id} leaves no {{token}} unfilled`, async () => {
				const data = FIXTURES[/** @type {keyof typeof FIXTURES} */ (type)];
				const { html, css, js } = await renderTemplate(type, entry.id, data);
				expect(html).not.toMatch(TOKEN_PATTERN);
				expect(html).not.toContain('via.placeholder.com');
				expect(html).toContain(data.displayName);
				expect(css).not.toMatch(TOKEN_PATTERN);
				expect(js).not.toMatch(TOKEN_PATTERN);
			});
		}
	}
});

describe('every generator template handles long boundary content', () => {
	for (const [type, entries] of Object.entries(TEMPLATES)) {
		for (const entry of entries) {
			it(`${type}/${entry.id} renders the long fixture`, async () => {
				const data = LONG_FIXTURES[/** @type {keyof typeof LONG_FIXTURES} */ (type)];
				const { html } = await renderTemplate(type, entry.id, data);
				expect(html).toContain(data.displayName);
				expect(html).not.toMatch(TOKEN_PATTERN);
				expect(html.length).toBeGreaterThan(500);
			});
		}
	}
});
