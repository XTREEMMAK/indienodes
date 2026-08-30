import { fill } from '../../shared.js';
import { artTokens, artworkFigure } from '../shared.js';
import shell from './shell.html?raw';
import css from './styles.css?raw';
import js from './gallery.js?raw';

/** Ambient layout: a restrained full-screen dissolve with persistent attribution. */
/** @param {import('../../shared.js').GeneratorData} data */
export function render(data) {
	const works = (data.artworks ?? [])
		.map((work, i) => artworkFigure(work, i, `slide${i === 0 ? ' active' : ''}`))
		.join('');
	const html = fill(shell, {
		...artTokens(data, works),
		ACCENT_OVERRIDE: data.colorOverride ?? ''
	});
	return { html: html.trim(), css: css.trim(), js: js.trim() };
}
