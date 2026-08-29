/**
 * Every template, grouped by the creator `type` it applies to. Each type can
 * carry multiple variants, and the picker UI reads the list rather than
 * assuming a fixed count, so adding another design is just a registry entry.
 *
 * @typedef {object} TemplateEntry
 * @property {string} id Stable, used as the stored `templateId` in a draft.
 * @property {string} label Shown in the picker.
 * @property {() => Promise<{ render: TemplateRenderer }>} load Loads this template's code on demand.
 */

/** @typedef {(data: import('./templates/shared.js').GeneratorData) => { html: string, css: string, js: string }} TemplateRenderer */
/** @typedef {TemplateEntry & { render: TemplateRenderer }} LoadedTemplateEntry */

/** @type {Record<'audio' | 'comic' | 'text' | 'game' | 'art', TemplateEntry[]>} */
export const TEMPLATES = {
	audio: [
		{
			id: 'late-signal',
			label: 'Late Signal',
			load: () => import('./templates/audio/lateSignal/index.js')
		},
		{
			id: 'midnight-echo',
			label: 'Midnight Echo',
			load: () => import('./templates/audio/midnightEcho/index.js')
		},
		{
			id: 'neon-signal',
			label: 'Neon Signal',
			load: () => import('./templates/audio/neonSignal/index.js')
		},
		{
			id: 'static-ticker',
			label: 'Static Ticker',
			load: () => import('./templates/audio/staticTicker/index.js')
		}
		// generator-scaffold:audio
	],
	comic: [
		{
			id: 'panel-room',
			label: 'Panel Room',
			load: () => import('./templates/comic/panelRoom/index.js')
		},
		{
			id: 'issue-box',
			label: 'Issue Box',
			load: () => import('./templates/comic/issueBox/index.js')
		},
		{
			id: 'ink-splash',
			label: 'Ink Splash',
			load: () => import('./templates/comic/inkSplash/index.js')
		},
		{
			id: 'print-run',
			label: 'Print Run',
			load: () => import('./templates/comic/printRun/index.js')
		}
		// generator-scaffold:comic
	],
	text: [
		{
			id: 'marginalia',
			label: 'Marginalia',
			load: () => import('./templates/text/marginalia/index.js')
		},
		{
			id: 'field-notes',
			label: 'Field Notes',
			load: () => import('./templates/text/fieldNotes/index.js')
		},
		{
			id: 'front-page',
			label: 'Front Page',
			load: () => import('./templates/text/frontPage/index.js')
		},
		{
			id: 'essay-archive',
			label: 'Essay Archive',
			load: () => import('./templates/text/essayArchive/index.js')
		}
		// generator-scaffold:text
	],
	game: [
		{
			id: 'cartridge',
			label: 'Cartridge',
			load: () => import('./templates/game/cartridge/index.js')
		},
		{
			id: 'arcade-hud',
			label: 'Arcade HUD',
			load: () => import('./templates/game/arcadeHud/index.js')
		},
		{
			id: 'neon-circuit',
			label: 'Neon Circuit',
			load: () => import('./templates/game/neonCircuit/index.js')
		},
		{
			id: 'pixel-archives',
			label: 'Pixel Archives',
			load: () => import('./templates/game/pixelArchives/index.js')
		}
		// generator-scaffold:game
	],
	art: [
		{
			id: 'quiet-gallery',
			label: 'Quiet Gallery',
			load: () => import('./templates/art/quietGallery/index.js')
		},
		{
			id: 'open-studio',
			label: 'Open Studio',
			load: () => import('./templates/art/openStudio/index.js')
		},
		{
			id: 'art-edition',
			label: 'Art Edition',
			load: () => import('./templates/art/artEdition/index.js')
		},
		{
			id: 'collection-wall',
			label: 'Collection Wall',
			load: () => import('./templates/art/collectionWall/index.js')
		},
		{
			id: 'slow-light',
			label: 'Slow Light',
			load: () => import('./templates/art/slowLight/index.js')
		}
		// generator-scaffold:art
	]
};

/**
 * Looks up one template by type and id, falling back to the first template
 * for that type when the id is missing or stale (the one case that can
 * genuinely happen: a draft saved against a template that was since
 * renamed or removed).
 * @param {string} type
 * @param {string} [templateId]
 * @returns {TemplateEntry | null}
 */
export function findTemplate(type, templateId) {
	const list = TEMPLATES[/** @type {keyof typeof TEMPLATES} */ (type)];
	if (!list?.length) return null;
	return list.find((t) => t.id === templateId) ?? list[0];
}

/**
 * Loads one selected renderer. The browser downloads template HTML, CSS,
 * and JavaScript only when that template is previewed or exported. Native
 * import caching makes repeated previews reuse the loaded module.
 * @param {string} type
 * @param {string} [templateId]
 * @returns {Promise<LoadedTemplateEntry | null>}
 */
export async function loadTemplate(type, templateId) {
	const entry = findTemplate(type, templateId);
	if (!entry) return null;
	const module = await entry.load();
	return { ...entry, render: module.render };
}
