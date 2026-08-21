const SILENT_WAV =
	'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
const ART = '/images/IndieNodes_Logo.webp';

/** @type {import('../lib/ring.js').RingEntry[]} */
export const SKIN_LAB_ENTRIES = [
	{
		id: 'skin-lab-audio',
		creator: 'Midnight Receiver',
		type: 'audio',
		why: 'Field recordings, soft machinery, and songs transmitted after closing time.',
		source_url: 'https://example.com/audio',
		tags: ['ambient', 'field-recording'],
		tracks: [{ label: 'Quiet Signal', media_url: SILENT_WAV }],
		thumb_url: ART,
		verification_token: 'skin-lab'
	},
	{
		id: 'skin-lab-comic',
		creator: 'Paper Lantern Comics',
		type: 'comic',
		why: 'A weekly ghost story about the last shop still open on an empty street.',
		source_url: 'https://example.com/comic',
		tags: ['horror', 'slice-of-life'],
		pages: [
			{ image_url: ART, caption: 'The shop after close.' },
			{ image_url: ART, caption: 'A knock at the back door.' }
		],
		verification_token: 'skin-lab'
	},
	{
		id: 'skin-lab-text',
		creator: 'Loose Leaf Press',
		type: 'text',
		why: 'Essays about food, memory, and the kitchens that held both.',
		source_url: 'https://example.com/text',
		tags: ['essay', 'food'],
		excerpts: [
			'The recipe card had been rewritten so many times that every measurement carried an opinion.',
			'Every kitchen keeps its own time, measured in cooling racks and kettles rather than clocks.'
		],
		thumb_url: ART,
		verification_token: 'skin-lab'
	},
	{
		id: 'skin-lab-game',
		creator: 'Tin Roof Studio',
		type: 'game',
		why: 'A slow puzzle game about weather systems and the towns waiting them out.',
		source_url: 'https://example.com/game',
		tags: ['puzzle', 'weather'],
		thumb_url: ART,
		verification_token: 'skin-lab'
	}
];

/** @param {import('../lib/ring.js').RingEntry} entry */
export function withoutLabArtwork(entry) {
	return {
		...entry,
		thumb_url: undefined,
		pages: entry.pages?.map((page) => ({ ...page, image_url: '' }))
	};
}
