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

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TEMPLATES, loadTemplate } from './registry.js';
import { TEMPLATE_OPTIONS, resolveColorVariables } from './templateOptions.js';
import { colorVariableOverrides } from './templates/shared.js';
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

describe('every generator type exposes its expected distinct templates', () => {
	const originalIds = {
		audio: 'late-signal',
		comic: 'panel-room',
		text: 'marginalia',
		game: 'cartridge',
		art: 'quiet-gallery'
	};

	for (const [type, entries] of Object.entries(TEMPLATES)) {
		it(`${type} has the expected template options with its default first`, async () => {
			const data = FIXTURES[/** @type {keyof typeof FIXTURES} */ (type)];
			const loaded = await Promise.all(entries.map((entry) => loadTemplate(type, entry.id)));
			const outputs = loaded.map((entry) => JSON.stringify(entry?.render(data)));
			expect(entries).toHaveLength(type === 'art' ? 5 : 4);
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
		game: 'class="poster',
		art: 'class="hero-work"'
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

describe('Art templates preserve the work and creator relationship', () => {
	for (const entry of TEMPLATES.art) {
		it(`${entry.id} keeps complete images, alt text, and artist identity`, async () => {
			const { html } = await renderTemplate('art', entry.id, FIXTURES.art);
			expect(html).toContain(FIXTURES.art.displayName);
			expect(html).toContain(FIXTURES.art.artworks?.[0].alt);
			expect(html).toContain(FIXTURES.art.artworks?.[0].title);
			expect(html).toContain('loading="eager"');
		});
	}
});

describe('text templates preserve safe work-sample formatting', () => {
	const formatted =
		'<h2>Kitchen notes</h2><p><strong>Bold</strong>, <em>italic</em>, <u>underlined</u>, and <s>revised</s>.</p><script>alert(1)</script>';

	for (const entry of TEMPLATES.text) {
		it(`${entry.id} carries editor formatting into the generated site`, async () => {
			const { html } = await renderTemplate('text', entry.id, {
				...FIXTURES.text,
				excerpts: [formatted]
			});
			expect(html).toContain('<h2>Kitchen notes</h2>');
			expect(html).toContain('<strong>Bold</strong>');
			expect(html).toContain('<em>italic</em>');
			expect(html).toContain('<u>underlined</u>');
			expect(html).toContain('<s>revised</s>');
			expect(html).not.toContain('<script>alert(1)</script>');
		});
	}
});

/**
 * Every template's directory, paired with its registered id by reading the
 * registry's own import paths — so a renamed folder shows up here rather
 * than as a silently skipped check.
 */
const TEMPLATE_DIRS = Object.fromEntries(
	[
		...readFileSync(new URL('./registry.js', import.meta.url), 'utf8').matchAll(
			/id:\s*'([^']+)'[\s\S]*?import\('\.\/templates\/([^']+)\/index\.js'\)/g
		)
	].map((match) => [match[1], match[2]])
);

/** @param {string} id */
function stylesheetFor(id) {
	const dir = TEMPLATE_DIRS[id];
	if (!dir) throw new Error(`No template directory found for "${id}" in registry.js.`);
	return readFileSync(new URL(`./templates/${dir}/styles.css`, import.meta.url), 'utf8');
}

/**
 * Renders with a creator's chosen colors resolved the way the real export
 * does — through the template's own declared role-to-variable mapping,
 * rather than by hand-writing the variable names into the test. That is the
 * point of the indirection, so the test has to exercise it.
 * @param {string} type
 * @param {string} id
 * @param {import('./templates/shared.js').GeneratorData} data
 * @param {Record<string, string>} colors
 */
async function renderWithColors(type, id, data, colors) {
	return renderTemplate(type, id, {
		...data,
		colorOverride: colorVariableOverrides(resolveColorVariables(id, colors))
	});
}

describe('template color roles', () => {
	it('declares options for every registered template, and only those', () => {
		// A template with no declaration silently offers no controls, and a
		// declaration for an id nobody registers is dead weight that reads as
		// working. Both are invisible without this.
		const registered = Object.values(TEMPLATES)
			.flat()
			.map((entry) => entry.id)
			.sort();
		expect(Object.keys(TEMPLATE_OPTIONS).sort()).toEqual(registered);
	});

	it('gives every template an accent role and a page background', () => {
		for (const [id, options] of Object.entries(TEMPLATE_OPTIONS)) {
			const keys = options.colors.map((option) => option.key);
			expect(keys, id).toContain('accent');
			expect(keys, id).toContain('ground');
		}
	});

	it('maps each role onto a variable that template actually defines', () => {
		// The mapping is only as good as its variable names: a typo here emits
		// a valid but inert override, which no rendering test can catch —
		// the markup still looks exactly right, the page just ignores it.
		//
		// Read off disk rather than out of `render()`, whose `css` is empty
		// under this project's plain-Node vitest environment (a `?raw` import
		// of a stylesheet resolves to '' there, unlike one of an .html file).
		// Reading the file is the more direct check regardless: it compares
		// the declaration against the stylesheet itself.
		for (const [id, options] of Object.entries(TEMPLATE_OPTIONS)) {
			const css = stylesheetFor(id);
			for (const option of options.colors) {
				expect(css, `${id} ${option.key} -> ${option.variable}`).toMatch(
					new RegExp(`^\\s*${option.variable}\\s*:`, 'm')
				);
			}
		}
	});

	it('leaves the stylesheet alone for a role the creator never touched', () => {
		expect(resolveColorVariables('late-signal', {})).toEqual({});
		expect(resolveColorVariables('late-signal', { ground: '   ' })).toEqual({});
	});

	it('ignores a role a template does not offer', () => {
		// Slow Light has no card surface; asking for one must not invent a
		// variable its stylesheet has never heard of.
		expect(resolveColorVariables('slow-light', { surface: '#123456' })).toEqual({});
	});

	it('applies every declared role through the template that declares it', async () => {
		for (const [id, options] of Object.entries(TEMPLATE_OPTIONS)) {
			const type = /** @type {keyof typeof FIXTURES} */ (
				Object.entries(TEMPLATES).find(([, entries]) =>
					entries.some((entry) => entry.id === id)
				)?.[0]
			);
			const colors = Object.fromEntries(
				options.colors.map((option, index) => [
					option.key,
					`#${String(index + 1).repeat(6)}`.slice(0, 7)
				])
			);
			const { html } = await renderWithColors(type, id, FIXTURES[type], colors);
			for (const [index, option] of options.colors.entries()) {
				expect(html, `${id} ${option.key}`).toContain(
					`${option.variable}:#${String(index + 1).repeat(6)}`
				);
			}
		}
	});
});

describe('audio template customizations', () => {
	it('Late Signal applies accent, ground, and surface overrides', async () => {
		const { html } = await renderWithColors('audio', 'late-signal', FIXTURES.audio, {
			accent: '#123456',
			ground: '#112233',
			surface: '#223344'
		});
		expect(html).toContain('--accent:#123456');
		expect(html).toContain('--ground:#112233');
		expect(html).toContain('--surface:#223344');
	});

	it('Midnight Echo renders themed custom players and icon-only social links', async () => {
		const { html, js } = await renderTemplate('audio', 'midnight-echo', {
			...FIXTURES.audio,
			socialLinks: [{ label: 'Bandcamp', url: 'https://artist.bandcamp.com' }]
		});
		expect(html).toContain('class="player-toggle"');
		expect(html).not.toContain('<audio controls');
		expect(html).toContain('aria-label="Bandcamp"');
		expect(html).not.toContain('>Bandcamp</a>');
		expect(js).toContain("querySelectorAll('.track-player')");
	});

	it('Neon Signal applies glow color and optional slow-path motion', async () => {
		const { html } = await renderWithColors(
			'audio',
			'neon-signal',
			{ ...FIXTURES.audio, backgroundGlowMotion: true },
			{ backgroundGlow: '#abcdef' }
		);
		expect(html).toContain('--background-glow:#abcdef');
		expect(html).toContain('<body class="glow-motion">');
	});
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
