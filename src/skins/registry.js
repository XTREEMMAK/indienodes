import basicManifest from './node/basic/manifest.js';

/** @type {Record<string, { default: import('./contracts.js').NodeSkinManifest }>} */
const nodeManifestModules = import.meta.glob('./node/*/manifest.js', { eager: true });
/** @type {Record<string, { default: import('./contracts.js').UiSkinManifest }>} */
const uiManifestModules = import.meta.glob('./ui/*/manifest.js', { eager: true });

/**
 * @param {Record<string, { default: any }>} modules
 * @param {'node' | 'ui'} category
 */
function manifests(modules, category) {
	return Object.values(modules)
		.map((module) => module.default)
		.filter((manifest) => manifest?.category === category)
		.sort((a, b) => a.label.localeCompare(b.label));
}

/** @type {import('./contracts.js').NodeSkinManifest[]} */
export const NODE_SKINS = manifests(nodeManifestModules, 'node');
/** @type {import('./contracts.js').UiSkinManifest[]} */
export const UI_SKINS = manifests(uiManifestModules, 'ui');

export const DEFAULT_NODE_SKIN_ID = 'basic';
export const DEFAULT_UI_SKIN_ID = 'glassmorphic';

/** @param {string | null | undefined} id */
export function findNodeSkin(id) {
	return NODE_SKINS.find((skin) => skin.id === id) ?? null;
}

/** @param {string | null | undefined} id */
export function findUiSkin(id) {
	return UI_SKINS.find((skin) => skin.id === id) ?? null;
}

/** @param {string | null | undefined} id */
export async function loadNodeSkin(id) {
	if (!id || id === basicManifest.id) return null;
	const manifest = findNodeSkin(id) ?? basicManifest;
	return manifest.load?.() ?? null;
}

/** @param {string | null | undefined} id */
export async function loadUiSkin(id) {
	const manifest = findUiSkin(id) ?? findUiSkin(DEFAULT_UI_SKIN_ID);
	if (!manifest) return;
	await manifest.load();
}

/**
 * A partial node skin is valid. Missing types always use Basic Nodes.
 * @param {import('./contracts.js').NodeSkinModule | null} skin
 * @param {string} type
 * @param {import('./contracts.js').NodeSkinModule} fallback
 */
export function resolveNodeStage(skin, type, fallback) {
	return skin?.stages?.[type] ?? fallback.stages[type] ?? fallback.stages.text;
}
