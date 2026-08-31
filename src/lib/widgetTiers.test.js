import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BADGE_STYLES, badgeAssetPath, embedHtmlFor, widgetPreviewHtml } from './widgetTiers.js';

describe('widget tiers', () => {
	it('builds a self-contained official-logo asset for every badge style and type', () => {
		const files = new Set(
			['audio', 'comic', 'game', 'text'].flatMap((type) =>
				BADGE_STYLES.map((style) => badgeAssetPath(style.id, type))
			)
		);

		for (const path of files) {
			const svg = readFileSync(`static${path}`, 'utf8');
			expect(svg, path).toContain('<image href="data:image/png;base64,');
			expect(svg, path).not.toContain('<circle');
		}
	});

	it('keeps badge copy-paste markup at the traditional dimensions', () => {
		const html = embedHtmlFor({
			tier: 'badge',
			badgeStyle: 'classic',
			origin: 'https://indienodes.us',
			entryType: 'audio'
		});

		expect(html).toContain('src="https://indienodes.us/badges/classic.svg"');
		expect(html).toContain('width="88" height="31"');
	});
});

describe('the preview still shared by both widget tiers', () => {
	const preview = widgetPreviewHtml();

	// The reason this exists: neither the script nor the sandboxed iframe can
	// reliably load inside the preview's own opaque-origin sandbox, so a
	// still stands in for both there.
	it('carries no script of any kind', () => {
		expect(preview).not.toMatch(/<script/i);
		expect(preview).not.toMatch(/indienode-widget/);
	});

	it('shows what the real widget shows', () => {
		for (const text of ['IndieNodes', 'Prev', 'Random', 'Next']) {
			expect(preview).toContain(text);
		}
	});

	it('uses the real mark rather than a redrawn one', () => {
		expect(preview).toContain('data:image');
	});

	// A still that only looked right in one theme would be worse than no
	// still, since the preview inherits whatever the viewer is using.
	it('defines both themes', () => {
		expect(preview).toContain('prefers-color-scheme: dark');
	});

	// The export path must be untouched by any of this: what a creator
	// downloads has to be the real, working embed, for either widget tier.
	it('does not change what the export writes for the sandboxed iframe (default) tier', () => {
		const real = embedHtmlFor({
			tier: 'widget',
			origin: 'https://indienodes.us',
			siteId: 'audio-example',
			entryType: 'audio'
		});
		expect(real).toContain('<iframe');
		expect(real).toContain('src="https://indienodes.us/embed-frame?site-id=audio-example"');
		expect(real).toMatch(/sandbox="[^"]*allow-scripts/);
		expect(real).not.toContain('allow-same-origin');
	});

	it('does not change what the export writes for the advanced script tier', () => {
		const real = embedHtmlFor({
			tier: 'widget-script',
			origin: 'https://indienodes.us',
			siteId: 'audio-example',
			entryType: 'audio'
		});
		expect(real).toContain('<script type="module"');
		expect(real).toContain('embed.v1.js');
		expect(real).toContain('site-id="audio-example"');
	});
});
