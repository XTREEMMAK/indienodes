import { describe, expect, it } from 'vitest';
import {
	DEFAULT_NODE_SKIN_ID,
	DEFAULT_UI_SKIN_ID,
	NODE_SKINS,
	UI_SKINS,
	loadNodeSkin,
	resolveNodeStage
} from './registry.js';
import { sanitizeSkinSelection } from './skinStore.svelte.js';
import * as basicNodeSkin from './node/basic/index.js';

describe('skin registry', () => {
	it('discovers the built-in manifests', () => {
		expect(NODE_SKINS.map((skin) => skin.id)).toContain(DEFAULT_NODE_SKIN_ID);
		expect(UI_SKINS.map((skin) => skin.id)).toContain(DEFAULT_UI_SKIN_ID);
	});

	it('loads every declared node stage', async () => {
		for (const manifest of NODE_SKINS) {
			const skin = (await loadNodeSkin(manifest.id)) ?? basicNodeSkin;
			for (const type of manifest.types) expect(skin.stages[type]).toBeTypeOf('function');
		}
	});

	it('falls back by type to Basic Nodes for partial skins', () => {
		const audio = basicNodeSkin.stages.audio;
		const partial = { stages: { audio } };
		expect(resolveNodeStage(partial, 'audio', basicNodeSkin)).toBe(audio);
		expect(resolveNodeStage(partial, 'comic', basicNodeSkin)).toBe(basicNodeSkin.stages.comic);
	});

	it('sanitizes removed or unknown stored skin ids', () => {
		expect(sanitizeSkinSelection({ uiSkin: 'missing', nodeSkin: 'missing' })).toEqual({
			version: 1,
			uiSkin: DEFAULT_UI_SKIN_ID,
			nodeSkin: DEFAULT_NODE_SKIN_ID
		});
	});
});
