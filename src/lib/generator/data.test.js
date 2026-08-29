import { describe, expect, it, vi } from 'vitest';
import { buildGeneratorData } from './data.js';

describe('audio generator data', () => {
	it('uses typed direct URLs when external hosting is selected', () => {
		const resolveAssetUrl = vi.fn();
		const data = buildGeneratorData(
			{
				type: 'audio',
				creator: 'Key Jay',
				why: 'VGM and more.',
				tracks: [
					{ label: 'Should I Stay', media_url: 'https://files.example/should-i-stay.mp3' },
					{ label: '  ', media_url: 'https://files.example/untitled.mp3' },
					{ label: 'Incomplete', media_url: '' }
				]
			},
			{ audioHosting: 'external', works: [] },
			resolveAssetUrl
		);

		expect(data.tracks).toEqual([
			{ label: 'Should I Stay', url: 'https://files.example/should-i-stay.mp3' },
			{ label: 'Untitled', url: 'https://files.example/untitled.mp3' }
		]);
		expect(resolveAssetUrl).toHaveBeenCalledTimes(1);
	});

	it('continues resolving uploaded files in bundled mode', () => {
		const file = new Blob(['audio'], { type: 'audio/mpeg' });
		const data = buildGeneratorData(
			{ type: 'audio', creator: 'Bundled', why: 'Local audio.' },
			{ audioHosting: 'bundle', works: [{ label: 'Local Track', file }] },
			(value) => (value === file ? 'blob:local-track' : null)
		);

		expect(data.tracks).toEqual([{ label: 'Local Track', url: 'blob:local-track' }]);
	});
});

describe('Art generator data', () => {
	it('maps uploaded work files and preserves useful metadata', () => {
		const image = new Blob(['image'], { type: 'image/png' });
		const data = buildGeneratorData(
			{ type: 'art', creator: 'Soft Orbit', why: 'Selected work.' },
			{
				works: [
					{
						file: image,
						alt: 'A violet landscape.',
						title: 'A Light Left On',
						year: '2026',
						medium: 'Digital gouache',
						external_url: 'https://artist.example/work'
					},
					{ file: image, alt: '   ' }
				]
			},
			(value) => (value === image ? 'blob:artwork' : null)
		);

		expect(data.artworks).toEqual([
			{
				url: 'blob:artwork',
				alt: 'A violet landscape.',
				title: 'A Light Left On',
				year: '2026',
				medium: 'Digital gouache',
				externalUrl: 'https://artist.example/work'
			}
		]);
	});
});

describe('text generator data', () => {
	it('keeps safe rich-text formatting and removes executable markup', () => {
		const data = buildGeneratorData(
			{
				type: 'text',
				creator: 'Loose Leaf',
				why: 'Essays.',
				excerpts: [
					{
						text: '<h2>Kitchen notes</h2><p><strong>Bold</strong>, <em>italic</em>, <u>underlined</u>, and <s>revised</s>.</p><script>alert(1)</script>'
					}
				]
			},
			{ socialLinks: [] },
			() => null
		);

		expect(data.excerpts).toEqual([
			'<h2>Kitchen notes</h2><p><strong>Bold</strong>, <em>italic</em>, <u>underlined</u>, and <s>revised</s>.</p>'
		]);
	});
});

describe('template customization resolves against the effective template', () => {
	/** @param {Record<string, any>} generator */
	const build = (generator, type = 'audio') =>
		buildGeneratorData({ type, creator: 'C', why: 'w' }, generator, () => null);

	it('maps a color role onto the chosen template’s own variable name', () => {
		// Same role, two templates, two different variables — which is the
		// whole reason roles exist.
		expect(
			build({ templateId: 'late-signal', colors: { ground: '#112233' } }).colorOverride
		).toContain('--ground:#112233');
		expect(
			build({ templateId: 'midnight-echo', colors: { ground: '#112233' } }).colorOverride
		).toContain('--bg:#112233');
	});

	it('still applies colors when the creator never opened the template picker', () => {
		// `findTemplate` falls back to the type's first template and that is
		// what actually renders, so resolving against an unset id would drop
		// every color a creator picked before choosing a template.
		const data = build({ colors: { ground: '#445566' } });
		expect(data.colorOverride).toContain('--ground:#445566');
	});

	it('emits nothing at all when no color was chosen', () => {
		expect(build({ templateId: 'late-signal' }).colorOverride).toBe('');
		expect(build({ templateId: 'late-signal', colors: {} }).colorOverride).toBe('');
	});

	it('drops a role the chosen template does not offer', () => {
		expect(
			build({ templateId: 'slow-light', colors: { surface: '#123456' } }, 'art').colorOverride
		).toBe('');
	});

	it('falls back to a switch’s declared default until it is set', () => {
		expect(build({ templateId: 'neon-signal' }).backgroundGlowMotion).toBe(false);
		expect(
			build({ templateId: 'neon-signal', options: { backgroundGlowMotion: true } })
				.backgroundGlowMotion
		).toBe(true);
	});
});
