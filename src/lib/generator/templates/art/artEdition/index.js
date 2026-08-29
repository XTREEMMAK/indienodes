import { fill } from '../../shared.js';
import { artTokens, artworkFigure } from '../shared.js';
import shell from './shell.html?raw';
import css from './styles.css?raw';

/** Editorial layout: cover-story typography and a captioned lead image. */
/** @param {import('../../shared.js').GeneratorData} data */
export function render(data) {
	const works = data.artworks ?? [];
	const lead = works[0] ? artworkFigure(works[0], 0, 'lead') : '';
	const index = works
		.slice(1)
		.map((work, i) => artworkFigure(work, i + 1, 'index-work'))
		.join('');
	const html = fill(shell, {
		...artTokens(data, `${lead}<div class="index">${index}</div>`),
		ACCENT_OVERRIDE: data.colorOverride ?? ''
	});
	return { html: html.trim(), css: css.trim(), js: '' };
}
