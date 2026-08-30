import { fill } from '../../shared.js';
import { artTokens, artworkFigure } from '../shared.js';
import shell from './shell.html?raw';
import css from './styles.css?raw';

/** Portfolio/studio layout: process-minded notes beside a flexible work rack. */
/** @param {import('../../shared.js').GeneratorData} data */
export function render(data) {
	const works = (data.artworks ?? []).map((work, i) => artworkFigure(work, i)).join('');
	const html = fill(shell, {
		...artTokens(data, works),
		ACCENT_OVERRIDE: data.colorOverride ?? ''
	});
	return { html: html.trim(), css: css.trim(), js: '' };
}
