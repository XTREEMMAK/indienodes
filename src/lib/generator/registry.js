import { render as lateSignal } from './templates/audio/lateSignal/index.js';
import { render as panelRoom } from './templates/comic/panelRoom/index.js';
import { render as marginalia } from './templates/text/marginalia/index.js';
import { render as cartridge } from './templates/game/cartridge/index.js';

/**
 * Every template, grouped by the creator `type` it applies to. A type's
 * list is deliberately allowed to hold just one entry for now (each type
 * has exactly one reviewed template as of this writing) — the picker UI in
 * `+page.svelte` reads this list rather than assuming a fixed count, so
 * adding a second or third variant per type later is a matter of adding an
 * entry here, not a change to how the picker works.
 *
 * @typedef {object} TemplateEntry
 * @property {string} id Stable, used as the stored `templateId` in a draft.
 * @property {string} label Shown in the picker.
 * @property {(data: import('./templates/shared.js').GeneratorData) => { html: string, css: string, js: string }} render
 */

/** @type {Record<'audio' | 'comic' | 'text' | 'game', TemplateEntry[]>} */
export const TEMPLATES = {
	audio: [{ id: 'late-signal', label: 'Late Signal', render: lateSignal }],
	comic: [{ id: 'panel-room', label: 'Panel Room', render: panelRoom }],
	text: [{ id: 'marginalia', label: 'Marginalia', render: marginalia }],
	game: [{ id: 'cartridge', label: 'Cartridge', render: cartridge }]
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
