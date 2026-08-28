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
