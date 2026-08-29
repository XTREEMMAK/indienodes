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
