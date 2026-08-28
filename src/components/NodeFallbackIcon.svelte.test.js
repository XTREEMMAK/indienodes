import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import NodeFallbackIcon from './NodeFallbackIcon.svelte';

/** @type {('comic' | 'text' | 'game')[]} */
const TYPES = ['comic', 'text', 'game'];

describe('NodeFallbackIcon', () => {
	for (const type of TYPES) {
		it(`renders the ${type} no-cover mark`, async () => {
			await render(NodeFallbackIcon, { type });

			const icon = document.querySelector(`[data-node-fallback-icon="${type}"]`);
			expect(icon).toBeInstanceOf(SVGElement);
			expect(icon?.getAttribute('aria-hidden')).toBe('true');

			const animatedPart =
				type === 'comic'
					? icon?.querySelector('.comic-page-left')
					: type === 'text'
						? icon?.querySelector('.writing-pencil')
						: icon;
			if (!animatedPart) throw new Error(`Missing animated part for ${type}`);
			expect(getComputedStyle(animatedPart).animationName).not.toBe('none');
		});
	}
});
