import { accentColorOverride, fill } from '../../shared.js';
import { artTokens, artworkFigure } from '../shared.js';
import shell from './shell.html?raw';
import css from './styles.css?raw';

/** Museum-like exhibition: one dominant work, restrained identity, quiet room. */
/** @param {import('../../shared.js').GeneratorData} data */
export function render(data) {
	const works = data.artworks ?? [];
	const hero = works[0] ? artworkFigure(works[0], 0, 'hero-work') : '';
	const selections = works
		.slice(1)
		.map((work, i) => artworkFigure(work, i + 1))
		.join('');
	const html = fill(shell, {
		...artTokens(data, `${hero}<div class="selections">${selections}</div>`),
		ACCENT_OVERRIDE: accentColorOverride(data.accentColor)
	});
	return { html: html.trim(), css: css.trim(), js: '' };
}
