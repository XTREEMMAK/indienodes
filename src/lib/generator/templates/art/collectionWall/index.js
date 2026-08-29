import { accentColorOverride, fill } from '../../shared.js';
import { artTokens, artworkFigure } from '../shared.js';
import shell from './shell.html?raw';
import css from './styles.css?raw';

/** Mosaic layout: all selected works share the wall without cropping. */
/** @param {import('../../shared.js').GeneratorData} data */
export function render(data) {
	const works = (data.artworks ?? [])
		.map((work, i) => artworkFigure(work, i, `tile tile-${i + 1}`))
		.join('');
	const html = fill(shell, {
		...artTokens(data, works),
		ACCENT_OVERRIDE: accentColorOverride(data.accentColor)
	});
	return { html: html.trim(), css: css.trim(), js: '' };
}
