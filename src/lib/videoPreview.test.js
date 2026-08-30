import { describe, expect, it } from 'vitest';
import { youtubeEmbedUrl, youtubeVideoId } from './videoPreview.js';

describe('youtubeVideoId', () => {
	it.each([
		'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
		'https://youtu.be/dQw4w9WgXcQ?t=43',
		'https://m.youtube.com/shorts/dQw4w9WgXcQ',
		'https://youtube.com/embed/dQw4w9WgXcQ',
		'https://www.youtube.com/live/dQw4w9WgXcQ'
	])('recognizes %s', (url) => {
		expect(youtubeVideoId(url)).toBe('dQw4w9WgXcQ');
	});

	it.each([
		'http://youtube.com/watch?v=dQw4w9WgXcQ',
		'https://example.com/watch?v=dQw4w9WgXcQ',
		'https://youtube.com/watch?v=too-short',
		'not a URL'
	])('rejects %s', (url) => {
		expect(youtubeVideoId(url)).toBeNull();
	});
});

it('builds a privacy-enhanced, click-to-play embed URL', () => {
	expect(youtubeEmbedUrl('https://youtu.be/dQw4w9WgXcQ')).toBe(
		'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1&rel=0&playsinline=1'
	);
});
