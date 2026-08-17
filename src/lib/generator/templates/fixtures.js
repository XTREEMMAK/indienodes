/**
 * One representative, complete `GeneratorData` object per type (see
 * `shared.js` for the real shape). Shared between `scripts/preview-
 * generator-template.js` (interactive viewing) and `registry.test.js`
 * (the "does every token actually get filled" regression check) so the two
 * cannot silently drift into testing against different data — the same
 * reasoning `shared.js`'s own doc comment gives for why `render()` itself
 * is the one path both preview and export share.
 *
 * Picsum URLs stand in for uploaded images; nothing in this module or in
 * `render()` itself fetches them, they are only linked from the HTML
 * `render()` produces, so there is no network dependency anywhere this
 * data is actually used.
 * @type {Record<'audio' | 'comic' | 'text' | 'game', import('./shared.js').GeneratorData>}
 */
export const FIXTURES = {
	audio: {
		type: 'audio',
		displayName: 'Driftwood Radio',
		why: 'Tape hiss and long fades, recorded live to cassette in an empty harbor warehouse.',
		bio: 'Driftwood Radio started as a way to make sense of a winter spent mostly alone in a rented harbor warehouse. Two cassette four-tracks, a shortwave radio for texture, and whatever the building itself was willing to contribute — a leaking pipe, a loose window, the particular hum of the heater at 3am. Nothing is quantized. Nothing is meant to be clean.',
		iconUrl: 'https://picsum.photos/seed/driftwood-icon/200/200',
		socialLinks: [
			{ label: 'Bandcamp', url: 'https://example.com/bandcamp' },
			{ label: 'Mastodon', url: 'https://example.com/mastodon' }
		],
		verificationToken: 'indienode-verify-preview-token',
		widgetEmbed:
			'<script type="module" src="https://indienodes.us/embed.v1.js"></script>\n<indienode-widget site-id="preview-site-id"></indienode-widget>',
		tracks: [
			{ label: 'Harbor Light', url: 'https://example.com/media/harbor-light.mp3' },
			{ label: 'Static Tide', url: 'https://example.com/media/static-tide.mp3' },
			{ label: 'Empty Warehouse, 3AM', url: 'https://example.com/media/empty-warehouse.mp3' }
		]
	},
	comic: {
		type: 'comic',
		displayName: 'Paper Lantern Comics',
		why: 'A quiet ghost story told one page a week, drawn in ink and midnight.',
		bio: 'Paper Lantern draws slice-of-life horror set in the same small town its creator grew up in — half memory, half invention, and mostly about the hour right after a shop closes for the night.',
		iconUrl: 'https://picsum.photos/seed/paper-lantern-icon/200/200',
		socialLinks: [{ label: 'Webtoon', url: 'https://example.com/webtoon' }],
		verificationToken: 'indienode-verify-preview-token',
		widgetEmbed:
			'<script type="module" src="https://indienodes.us/embed.v1.js"></script>\n<indienode-widget site-id="preview-site-id"></indienode-widget>',
		pages: [
			{
				url: 'https://picsum.photos/seed/nightshift-1/800/1100',
				caption: 'The shop, after close.'
			},
			{
				url: 'https://picsum.photos/seed/nightshift-2/800/1100',
				caption: 'A knock at the back door.'
			},
			{ url: 'https://picsum.photos/seed/nightshift-3/800/1100', caption: 'Nobody there.' }
		]
	},
	text: {
		type: 'text',
		displayName: 'Loose Leaf Press',
		why: 'Short essays about food, memory, and the kitchens that held both.',
		bio: 'Loose Leaf Press is one person writing short essays about the kitchens that raised them, published roughly whenever one finishes rather than on any kind of schedule.',
		iconUrl: 'https://picsum.photos/seed/loose-leaf-icon/200/200',
		socialLinks: [{ label: 'Newsletter', url: 'https://example.com/newsletter' }],
		verificationToken: 'indienode-verify-preview-token',
		widgetEmbed:
			'<script type="module" src="https://indienodes.us/embed.v1.js"></script>\n<indienode-widget site-id="preview-site-id"></indienode-widget>',
		excerpt:
			'The stove ran on a pilot light older than either of us, and it never once went out, not through three landlords and one very bad winter.\n\nWe called it the fourth roommate. It kept worse hours than the rest of us and never once paid rent, but it was there every morning before anyone else was awake, so we forgave it that.'
	},
	game: {
		type: 'game',
		displayName: 'Tin Roof Studio',
		why: 'A slow puzzle game about weather systems and the towns that wait them out.',
		bio: 'Tin Roof Studio is a solo developer working out of a converted garage, building small, quiet games about weather and waiting rather than reflexes and score.',
		iconUrl: 'https://picsum.photos/seed/tin-roof-icon/200/200',
		socialLinks: [{ label: 'itch.io', url: 'https://example.com/itch' }],
		verificationToken: 'indienode-verify-preview-token',
		widgetEmbed:
			'<script type="module" src="https://indienodes.us/embed.v1.js"></script>\n<indienode-widget site-id="preview-site-id"></indienode-widget>',
		screenshotUrl: 'https://picsum.photos/seed/weather-systems/1200/700'
	}
};
