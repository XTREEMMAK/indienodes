import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BADGE_STYLES, badgeAssetPath, embedHtmlFor } from './widgetTiers.js';

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
