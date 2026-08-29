/**
 * One representative, complete `GeneratorData` object per type (see
 * `shared.js` for the real shape). Shared between `scripts/preview-
 * generator-template.js` (interactive viewing) and `registry.test.js`
 * (the "does every token actually get filled" regression check) so the two
 * cannot silently drift into testing against different data — the same
 * reasoning `shared.js`'s own doc comment gives for why `render()` itself
 * is the one path both preview and export share.
 *
 * Asset URLs point at project-owned files under `testing/generator-assets`. The
 * standalone preview server exposes that directory at
 * `/__generator_assets/`, keeping previews and screenshots offline and
 * deterministic.
 */
const SILENT_WAV =
	'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';

/**
 * @type {Record<'audio' | 'comic' | 'text' | 'game' | 'art', import('./shared.js').GeneratorData>}
 */
export const FIXTURES = {
	audio: {
		type: 'audio',
		displayName: 'Driftwood Radio',
		why: 'Tape hiss and long fades, recorded live to cassette in an empty harbor warehouse.',
		bio: 'Driftwood Radio started as a way to make sense of a winter spent mostly alone in a rented harbor warehouse. Two cassette four-tracks, a shortwave radio for texture, and whatever the building itself was willing to contribute — a leaking pipe, a loose window, the particular hum of the heater at 3am. Nothing is quantized. Nothing is meant to be clean.',
		bioHtml:
			'Driftwood Radio started as a way to make sense of a winter spent mostly alone in a rented harbor warehouse. Two cassette four-tracks, a shortwave radio for texture, and whatever the building itself was willing to contribute — a leaking pipe, a loose window, the particular hum of the heater at 3am. Nothing is quantized. Nothing is meant to be clean.',
		iconUrl: '/__generator_assets/creator-audio.svg',
		socialLinks: [
			{ label: 'Bandcamp', url: 'https://example.com/bandcamp' },
			{ label: 'Mastodon', url: 'https://example.com/mastodon' }
		],
		verificationToken: 'indienode-verify-preview-token',
		widgetEmbed:
			'<script type="module" src="https://indienodes.us/embed.v1.js"></script>\n<indienode-widget site-id="preview-site-id"></indienode-widget>',
		tracks: [
			{ label: 'Harbor Light', url: SILENT_WAV },
			{ label: 'Static Tide', url: SILENT_WAV },
			{ label: 'Empty Warehouse, 3AM', url: SILENT_WAV }
		]
	},
	comic: {
		type: 'comic',
		displayName: 'Paper Lantern Comics',
		why: 'A quiet ghost story told one page a week, drawn in ink and midnight.',
		bio: 'Paper Lantern draws slice-of-life horror set in the same small town its creator grew up in — half memory, half invention, and mostly about the hour right after a shop closes for the night.',
		bioHtml:
			'Paper Lantern draws slice-of-life horror set in the same small town its creator grew up in — half memory, half invention, and mostly about the hour right after a shop closes for the night.',
		iconUrl: '/__generator_assets/creator-comic.svg',
		socialLinks: [{ label: 'Webtoon', url: 'https://example.com/webtoon' }],
		verificationToken: 'indienode-verify-preview-token',
		widgetEmbed:
			'<script type="module" src="https://indienodes.us/embed.v1.js"></script>\n<indienode-widget site-id="preview-site-id"></indienode-widget>',
		pages: [
			{
				url: '/__generator_assets/comic-page-01.svg',
				caption: 'The shop, after close.'
			},
			{
				url: '/__generator_assets/comic-page-02.svg',
				caption: 'A knock at the back door.'
			},
			{
				url: '/__generator_assets/comic-page-03.svg',
				caption: 'Nobody there.'
			}
		]
	},
	text: {
		type: 'text',
		displayName: 'Loose Leaf Press',
		why: 'Short essays about food, memory, and the kitchens that held both.',
		bio: 'Loose Leaf Press is one person writing short essays about the kitchens that raised them, published roughly whenever one finishes rather than on any kind of schedule.',
		bioHtml:
			'Loose Leaf Press is one person writing short essays about the kitchens that raised them, published roughly whenever one finishes rather than on any kind of schedule.',
		iconUrl: '/__generator_assets/creator-text.svg',
		socialLinks: [{ label: 'Newsletter', url: 'https://example.com/newsletter' }],
		verificationToken: 'indienode-verify-preview-token',
		widgetEmbed:
			'<script type="module" src="https://indienodes.us/embed.v1.js"></script>\n<indienode-widget site-id="preview-site-id"></indienode-widget>',
		excerpts: [
			'The stove ran on a pilot light older than either of us, and it never once went out, not through three landlords and one very bad winter.',
			'We called it the fourth roommate. It kept worse hours than the rest of us and never once paid rent, but it was there every morning before anyone else was awake, so we forgave it that.'
		]
	},
	game: {
		type: 'game',
		displayName: 'Tin Roof Studio',
		why: 'A slow puzzle game about weather systems and the towns that wait them out.',
		bio: 'Tin Roof Studio is a solo developer working out of a converted garage, building small, quiet games about weather and waiting rather than reflexes and score.',
		bioHtml:
			'Tin Roof Studio is a solo developer working out of a converted garage, building small, quiet games about weather and waiting rather than reflexes and score.',
		iconUrl: '/__generator_assets/creator-game.svg',
		socialLinks: [{ label: 'itch.io', url: 'https://example.com/itch' }],
		verificationToken: 'indienode-verify-preview-token',
		widgetEmbed:
			'<script type="module" src="https://indienodes.us/embed.v1.js"></script>\n<indienode-widget site-id="preview-site-id"></indienode-widget>',
		screenshotUrl: '/__generator_assets/game-screenshot.svg'
	},
	art: {
		type: 'art',
		displayName: 'Soft Orbit Studio',
		why: 'Color, memory, and small imagined landscapes from an independent illustrator.',
		bio: 'Soft Orbit Studio is the home of one illustrator working between gouache, digital collage, and small looping experiments. These selected works are an introduction; the full portfolio lives with the artist.',
		bioHtml:
			'Soft Orbit Studio is the home of one illustrator working between gouache, digital collage, and small looping experiments. These selected works are an introduction; the full portfolio lives with the artist.',
		iconUrl: '/__generator_assets/creator-art.svg',
		socialLinks: [
			{ label: 'Portfolio', url: 'https://example.com/portfolio' },
			{ label: 'ArtStation', url: 'https://example.com/artstation' }
		],
		verificationToken: 'indienode-verify-preview-token',
		widgetEmbed:
			'<script type="module" src="https://indienodes.us/embed.v1.js"></script>\n<indienode-widget site-id="preview-site-id"></indienode-widget>',
		artworks: [
			{
				url: '/__generator_assets/art-landscape.svg',
				alt: 'A violet dusk landscape with a small illuminated house beside a lake.',
				title: 'A Light Left On',
				year: '2026',
				medium: 'Digital gouache'
			},
			{
				url: '/__generator_assets/art-portrait.svg',
				alt: 'A tall abstract portrait built from coral, blue, and cream shapes.',
				title: 'Neighboring Weather',
				year: '2025',
				medium: 'Gouache and collage'
			},
			{
				url: '/__generator_assets/art-square.svg',
				alt: 'A square composition of orbiting dots and curved golden paths.',
				title: 'Small Gravity',
				medium: 'Vector illustration'
			}
		]
	}
};

const LONG_NAME =
	'The Extremely Long Independent Creator Collective and Midnight Recording Society';
/**
 * Fixtures carry both `bio` and `bioHtml` because templates render the HTML
 * one. `buildGeneratorData` derives it in the real pipeline; a fixture handed
 * straight to `render()` has to supply it, or every template quietly draws a
 * page with no bio on it and the reference screenshots agree that it is fine.
 */
const LONG_BIO =
	'This deliberately long biography tests wrapping, vertical rhythm, and narrow screens. It includes enough detail to occupy several lines without relying on remote content, while still reading like plausible creator copy rather than filler text.';
const LONG_SOCIAL_LINKS = [
	{ label: 'Bandcamp releases and archival recordings', url: 'https://example.com/bandcamp' },
	{ label: 'Mastodon conversations', url: 'https://example.com/mastodon' },
	{ label: 'Newsletter and production notes', url: 'https://example.com/newsletter' },
	{ label: 'Video sessions', url: 'https://example.com/video' },
	{ label: 'Photo archive', url: 'https://example.com/photos' }
];

/**
 * Boundary fixture used by rendering tests and visual screenshots. It keeps
 * the maximum three works while stressing long names, labels, biographies,
 * captions, prose, and social-link wrapping.
 * @type {typeof FIXTURES}
 */
export const LONG_FIXTURES = {
	audio: {
		...FIXTURES.audio,
		displayName: LONG_NAME,
		why: 'A very long description of field recordings, layered instruments, collaborative performances, and tapes recovered from forgotten rehearsal rooms.',
		bio: LONG_BIO,
		bioHtml: LONG_BIO,
		socialLinks: LONG_SOCIAL_LINKS,
		tracks: FIXTURES.audio.tracks?.map((track, index) => ({
			...track,
			label: `${track.label}: Extended Field Recording Session Number ${index + 1}`
		}))
	},
	comic: {
		...FIXTURES.comic,
		displayName: LONG_NAME,
		why: 'A serialized illustrated story with quiet scenes, crowded captions, and chapter names that need room to breathe.',
		bio: LONG_BIO,
		bioHtml: LONG_BIO,
		socialLinks: LONG_SOCIAL_LINKS,
		pages: FIXTURES.comic.pages?.map((page, index) => ({
			...page,
			caption: `Chapter ${index + 1}: A deliberately long caption about the shop after midnight and the footsteps beyond the locked back door.`
		}))
	},
	text: {
		...FIXTURES.text,
		displayName: LONG_NAME,
		why: 'Long-form essays about food, memory, inherited tools, changing neighborhoods, and the rooms where stories become family history.',
		bio: LONG_BIO,
		bioHtml: LONG_BIO,
		socialLinks: LONG_SOCIAL_LINKS,
		excerpts: [
			FIXTURES.text.excerpts?.[0] ?? '',
			'The recipe card had been rewritten so many times that every measurement carried at least three opinions. One margin held a correction in blue pencil, another held a warning about the old oven, and the back had become a grocery list from a year nobody remembered.',
			'What survived was not precision but repetition: the same bowl on the same counter, the same window fogging at the edges, and the same pause before anyone decided the dough had finally become itself.'
		]
	},
	game: {
		...FIXTURES.game,
		displayName: LONG_NAME,
		why: 'A slow systems game about changing weather, complicated towns, mutual aid, and the choices people make while waiting for a storm to pass.',
		bio: LONG_BIO,
		bioHtml: LONG_BIO,
		socialLinks: LONG_SOCIAL_LINKS
	},
	art: {
		...FIXTURES.art,
		displayName: LONG_NAME,
		why: 'A wide-ranging visual practice spanning illustration, painting, collage, experimental color studies, and imagined environments.',
		bio: LONG_BIO,
		bioHtml: LONG_BIO,
		socialLinks: LONG_SOCIAL_LINKS,
		artworks: FIXTURES.art.artworks?.map((work, index) => ({
			...work,
			title: `${work.title}: Selected Work Number ${index + 1} from an Ongoing Independent Series`
		}))
	}
};
