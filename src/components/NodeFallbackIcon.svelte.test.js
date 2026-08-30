import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import NodeFallbackIcon from './NodeFallbackIcon.svelte';

/**
 * The shapes that belong to each mark, and — just as load-bearing — the ones
 * that must not appear with it.
 *
 * The previous version of this test asked only whether *something* on the
 * `game` icon was animated, and the `<svg>` itself carries an animation, so
 * it passed for months while the game branch was missing from the markup
 * entirely and its paths sat inside the `art` branch. Art therefore drew a
 * picture frame with a gamepad through it and game drew nothing at all.
 * Naming the parts is what makes that visible.
 */
const MARKS = {
	comic: { parts: ['.comic-page-left', '.comic-page-right'], animated: '.comic-page-left' },
	text: { parts: ['.paper', '.writing-pencil'], animated: '.writing-pencil' },
	art: { parts: ['.art-frame', '.art-sun', '.art-landscape'], animated: '.art-sun' },
	game: { parts: ['.game-body', '.game-pad', '.game-button'], animated: '.game-button' }
};

describe('NodeFallbackIcon', () => {
	for (const [type, mark] of Object.entries(MARKS)) {
		it(`renders the ${type} no-cover mark`, async () => {
			await render(NodeFallbackIcon, { type });

			const icon = document.querySelector(`[data-node-fallback-icon="${type}"]`);
			expect(icon).toBeInstanceOf(SVGElement);
			expect(icon?.getAttribute('aria-hidden')).toBe('true');

			for (const part of mark.parts) {
				expect(icon?.querySelector(part), `${type} is missing ${part}`).not.toBeNull();
			}

			const animated = icon?.querySelector(mark.animated);
			if (!animated) throw new Error(`Missing animated part for ${type}`);
			expect(getComputedStyle(animated).animationName).not.toBe('none');
		});

		it(`draws nothing belonging to another type on the ${type} mark`, async () => {
			await render(NodeFallbackIcon, { type });
			const icon = document.querySelector(`[data-node-fallback-icon="${type}"]`);
			const foreign = Object.entries(MARKS)
				.filter(([other]) => other !== type)
				.flatMap(([, other]) => other.parts)
				.filter((part) => !mark.parts.includes(part));
			for (const part of foreign) {
				expect(icon?.querySelector(part), `${type} should not contain ${part}`).toBeNull();
			}
		});
	}
});
