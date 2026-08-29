/**
 * What each generated-site template lets its creator change, declared rather
 * than hardcoded into the form that renders the controls.
 *
 * **The problem this replaces.** Customization had grown one `{#if
 * selectedTemplateId === '...'}` branch at a time inside `/join`'s markup:
 * Late Signal alone offered a page background and a card surface, Neon
 * Signal alone offered its glow, and the other nineteen templates offered a
 * single accent color — three of which (Panel Room, Cartridge, Marginalia)
 * silently offered even that, since their shells had no override placeholder
 * for it to land in. Adding a control meant editing a form; whether a
 * control did anything was invisible from either side.
 *
 * So a template declares its own surface here and the form renders whatever
 * it finds. That is what makes "customization by content type" a matter of
 * filling in a table rather than of writing UI, and it is what let one
 * template's ground/surface controls become every template's.
 *
 * **Color roles are indirection on purpose.** Every template already had a
 * page background and most had a raised surface; what they did not have was
 * a shared name for them. The same role is `--ground` in Late Signal,
 * `--bg` in Midnight Echo, `--paper` in Art Edition, `--m-bg` in Static
 * Ticker. A role maps the one thing a creator is choosing ("the page
 * background") onto the variable that particular design happens to call it,
 * so neither side has to know about the other: the form asks for a role,
 * the stylesheet keeps its own vocabulary, and nothing had to be renamed
 * across twenty-one hand-written stylesheets to connect them.
 *
 * A role is simply **omitted** where a template has no such surface (Slow
 * Light has no cards) or where overriding it would break the design (Neon
 * Signal's `--card` is a translucent `rgba()`, and a color input can only
 * produce opaque hex, so offering it would quietly flatten the glass the
 * whole template is built on). Omission is the mechanism for "this control
 * would not do anything good here" and is preferred to shipping a control
 * that disappoints.
 */

/**
 * @typedef {object} ColorOption
 * @property {string} key Stored under `generator.colors[key]`.
 * @property {string} variable The CSS custom property *this* template uses for it.
 * @property {string} label
 * @property {string} hint
 * @property {string} fallback The template's own default, so an untouched picker shows the truth.
 */

/**
 * @typedef {object} SwitchOption
 * @property {string} key Stored under `generator.options[key]`.
 * @property {'toggle'} kind
 * @property {string} label
 * @property {string} hint
 * @property {boolean} fallback
 */

/**
 * @typedef {object} TemplateOptions
 * @property {ColorOption[]} colors
 * @property {SwitchOption[]} switches
 */

/** Every template offers this one; only the variable and default differ. */
const ACCENT = { key: 'accent', label: 'Main color', hint: "The template's own highlight color." };
const GROUND = {
	key: 'ground',
	label: 'Page background',
	hint: 'The ground behind every section.'
};
const SURFACE = {
	key: 'surface',
	label: 'Card surface',
	hint: 'The raised panels sitting on that ground.'
};
const INK = {
	key: 'text',
	label: 'Text color',
	hint: 'Body copy. Keep it readable on the ground above.'
};

/**
 * @param {typeof ACCENT} role
 * @param {string} variable
 * @param {string} fallback
 * @returns {ColorOption}
 */
function color(role, variable, fallback) {
	return { ...role, variable, fallback };
}

/**
 * Per template id. Keys match `registry.js`; `resolveTemplateOptions` below
 * is the only thing that should read this directly.
 * @type {Record<string, TemplateOptions>}
 */
export const TEMPLATE_OPTIONS = {
	// -------------------------------------------------------------- audio ---
	'late-signal': {
		colors: [
			color(ACCENT, '--accent', '#6fae9c'),
			color(GROUND, '--ground', '#171411'),
			color(SURFACE, '--surface', '#221d19'),
			color(INK, '--text', '#f2ece4')
		],
		switches: []
	},
	'midnight-echo': {
		colors: [
			color(ACCENT, '--accent', '#7928ca'),
			color(GROUND, '--bg', '#0a0c10'),
			color(SURFACE, '--card-bg', '#121620'),
			color(INK, '--text', '#f4f6f8')
		],
		switches: []
	},
	'neon-signal': {
		// No surface: `--card` is a translucent rgba and a color input cannot
		// express one. The glow is this template's own headline control.
		colors: [
			color(ACCENT, '--neon-cyan', '#00f3ff'),
			color(GROUND, '--bg', '#05050d'),
			color(INK, '--text', '#ffffff'),
			{
				key: 'backgroundGlow',
				variable: '--background-glow',
				label: 'Background glow',
				hint: 'The large circle of light behind the page.',
				fallback: '#9d00ff'
			}
		],
		switches: [
			{
				key: 'backgroundGlowMotion',
				kind: 'toggle',
				label: 'Move the glow slowly',
				hint: 'Follows a calm path behind the page, and respects reduced-motion settings.',
				fallback: false
			}
		]
	},
	'static-ticker': {
		colors: [
			color(ACCENT, '--m-accent', '#ff0055'),
			color(GROUND, '--m-bg', '#000000'),
			color(SURFACE, '--m-card', '#121212'),
			color(INK, '--m-text', '#ffffff')
		],
		switches: []
	},

	// -------------------------------------------------------------- comic ---
	'panel-room': {
		colors: [
			color(ACCENT, '--accent', '#c23b3b'),
			color(GROUND, '--ground', '#eee9dc'),
			color(SURFACE, '--panel', '#ffffff'),
			color(INK, '--ink', '#1c1a17')
		],
		switches: []
	},
	'issue-box': {
		colors: [
			color(ACCENT, '--accent', '#ff2a5f'),
			color(GROUND, '--bg', '#121214'),
			color(SURFACE, '--card-bg', '#1c1c21'),
			color(INK, '--text', '#f0f0f5')
		],
		switches: []
	},
	'ink-splash': {
		// No ink role: this template has no single body-text variable, its
		// copy sits on the card and takes the card's own contrast.
		colors: [
			color(ACCENT, '--c-blue', '#0088ff'),
			color(GROUND, '--c-bg', '#f4f0ea'),
			color(SURFACE, '--c-card', '#ffffff')
		],
		switches: []
	},
	'print-run': {
		colors: [
			color(ACCENT, '--pink', '#ff0055'),
			color(GROUND, '--bg', '#0d0d11'),
			color(SURFACE, '--card', '#181822'),
			color(INK, '--text', '#ffffff')
		],
		switches: []
	},

	// --------------------------------------------------------------- text ---
	marginalia: {
		colors: [
			color(ACCENT, '--accent', '#8a6bb0'),
			color(GROUND, '--ground', '#faf8f4'),
			color(INK, '--text', '#2b2823')
		],
		switches: []
	},
	'field-notes': {
		colors: [
			color(ACCENT, '--accent', '#ff4500'),
			color(GROUND, '--bg', '#f7f6f2'),
			color(INK, '--text', '#1a1a1a')
		],
		switches: []
	},
	'front-page': {
		colors: [
			color(ACCENT, '--t-accent', '#00e5ff'),
			color(GROUND, '--t-bg', '#0f1115'),
			color(SURFACE, '--t-card', '#181b22'),
			color(INK, '--t-text', '#e6e8ec')
		],
		switches: []
	},
	'essay-archive': {
		colors: [
			color(ACCENT, '--cyan', '#00e5ff'),
			color(GROUND, '--bg', '#0f1015'),
			color(SURFACE, '--card', '#171922'),
			color(INK, '--text', '#e6e8ec')
		],
		switches: []
	},

	// --------------------------------------------------------------- game ---
	'arcade-hud': {
		colors: [
			color(ACCENT, '--g-accent', '#7000ff'),
			color(GROUND, '--g-bg', '#09070f'),
			color(SURFACE, '--g-card', '#140f26'),
			color(INK, '--g-text', '#ffffff')
		],
		switches: []
	},
	cartridge: {
		colors: [
			color(ACCENT, '--yellow', '#f2c94c'),
			color(GROUND, '--ground', '#0d0d12'),
			color(SURFACE, '--panel', '#17161d'),
			color(INK, '--text', '#f2f0ea')
		],
		switches: []
	},
	'neon-circuit': {
		colors: [
			color(ACCENT, '--purple', '#7000ff'),
			color(GROUND, '--bg', '#080612'),
			color(SURFACE, '--card', '#120e28'),
			color(INK, '--text', '#ffffff')
		],
		switches: []
	},
	'pixel-archives': {
		colors: [
			color(ACCENT, '--accent', '#00f0ff'),
			color(GROUND, '--bg', '#0c0814'),
			color(SURFACE, '--card-bg', '#161024'),
			color(INK, '--text', '#ffffff')
		],
		switches: []
	},

	// ---------------------------------------------------------------- art ---
	'quiet-gallery': {
		colors: [
			color(ACCENT, '--accent', '#9d365d'),
			color(GROUND, '--ground', '#eeeae3'),
			{ ...SURFACE, label: 'Frame color', variable: '--frame', fallback: '#ffffff' },
			color(INK, '--ink', '#191817')
		],
		switches: []
	},
	'collection-wall': {
		colors: [
			color(ACCENT, '--accent', '#ec4899'),
			color(GROUND, '--ground', '#101318'),
			{ ...SURFACE, label: 'Tile color', variable: '--tile', fallback: '#1b2028' },
			color(INK, '--ink', '#f3efe7')
		],
		switches: []
	},
	'slow-light': {
		// Deliberately surface-free: the design is one continuous ground.
		colors: [
			color(ACCENT, '--accent', '#ec4899'),
			color(GROUND, '--ground', '#0b0c10'),
			color(INK, '--ink', '#f8f5ef')
		],
		switches: []
	},
	'art-edition': {
		colors: [
			color(ACCENT, '--accent', '#d53f70'),
			color(GROUND, '--paper', '#fbf8f0'),
			color(INK, '--ink', '#111111')
		],
		switches: []
	},
	'open-studio': {
		colors: [
			color(ACCENT, '--accent', '#286f6a'),
			color(GROUND, '--paper', '#f5edda'),
			color(SURFACE, '--card', '#fffaf0'),
			color(INK, '--ink', '#25231f')
		],
		switches: []
	}
};

/** @type {TemplateOptions} */
const NONE = { colors: [], switches: [] };

/**
 * What a given template offers. An unknown id returns nothing rather than
 * throwing: a draft can hold a `templateId` from a template that has since
 * been renamed or removed, and the right answer there is a form with no
 * extra controls, not a crash on a step the creator is only passing through.
 * @param {string | null | undefined} templateId
 * @returns {TemplateOptions}
 */
export function resolveTemplateOptions(templateId) {
	return (templateId && TEMPLATE_OPTIONS[templateId]) || NONE;
}

/**
 * The CSS custom properties a creator's stored choices should set, resolved
 * against one template's own variable names.
 *
 * Only keys the creator actually chose are returned. An untouched control
 * must leave the stylesheet's own default in place rather than re-asserting
 * the fallback the picker was displaying — those are the same color today
 * and would silently stop being so the moment a template is retouched.
 * @param {string | null | undefined} templateId
 * @param {Record<string, string> | undefined} colors Chosen values by option key.
 * @returns {Record<string, string>} CSS variable name to value.
 */
export function resolveColorVariables(templateId, colors) {
	/** @type {Record<string, string>} */
	const resolved = {};
	if (!colors) return resolved;
	for (const option of resolveTemplateOptions(templateId).colors) {
		const chosen = colors[option.key];
		if (typeof chosen === 'string' && chosen.trim()) resolved[option.variable] = chosen.trim();
	}
	return resolved;
}

/**
 * One switch's effective value: what the creator chose, or the template's
 * own default when they have not touched it.
 * @param {string | null | undefined} templateId
 * @param {Record<string, unknown> | undefined} options
 * @param {string} key
 * @returns {boolean}
 */
export function switchValue(templateId, options, key) {
	const chosen = options?.[key];
	if (typeof chosen === 'boolean') return chosen;
	const declared = resolveTemplateOptions(templateId).switches.find((s) => s.key === key);
	return declared?.fallback ?? false;
}
