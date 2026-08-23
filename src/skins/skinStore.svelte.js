import { browser } from '$app/environment';
import { STORAGE_KEYS, safeReadJson, safeWriteJson } from '$lib/storageKeys.js';
import {
	DEFAULT_NODE_SKIN_ID,
	DEFAULT_UI_SKIN_ID,
	findNodeSkin,
	findUiSkin,
	loadUiSkin
} from './registry.js';

const STORAGE_KEY = STORAGE_KEYS.skins.key;
const VERSION = 1;

/** @param {{ uiSkin?: unknown, nodeSkin?: unknown } | null | undefined} value */
export function sanitizeSkinSelection(value) {
	return {
		version: VERSION,
		uiSkin:
			findUiSkin(typeof value?.uiSkin === 'string' ? value.uiSkin : null)?.id ?? DEFAULT_UI_SKIN_ID,
		nodeSkin:
			findNodeSkin(typeof value?.nodeSkin === 'string' ? value.nodeSkin : null)?.id ??
			DEFAULT_NODE_SKIN_ID
	};
}

function loadSelection() {
	if (!browser) return sanitizeSkinSelection(null);
	return sanitizeSkinSelection(safeReadJson(STORAGE_KEY, null));
}

function createSkinStore() {
	let selection = $state(loadSelection());

	function save() {
		if (browser) safeWriteJson(STORAGE_KEY, selection);
	}

	function applyUi() {
		if (!browser) return;
		document.documentElement.dataset.uiSkin = selection.uiSkin;
		loadUiSkin(selection.uiSkin).catch((error) => console.error('Could not load UI skin.', error));
	}

	return {
		get uiSkin() {
			return selection.uiSkin;
		},
		get nodeSkin() {
			return selection.nodeSkin;
		},
		/** @param {string} id */
		setUiSkin(id) {
			selection.uiSkin = findUiSkin(id)?.id ?? DEFAULT_UI_SKIN_ID;
			save();
			applyUi();
		},
		/** @param {string} id */
		setNodeSkin(id) {
			selection.nodeSkin = findNodeSkin(id)?.id ?? DEFAULT_NODE_SKIN_ID;
			save();
		},
		init() {
			applyUi();
		}
	};
}

export const skinStore = createSkinStore();
