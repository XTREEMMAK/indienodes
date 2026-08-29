const YOUTUBE_HOSTS = new Set([
	'youtube.com',
	'www.youtube.com',
	'm.youtube.com',
	'music.youtube.com',
	'youtu.be',
	'www.youtu.be'
]);

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

/**
 * Extracts a YouTube video id from the public URL forms creators commonly copy.
 * Returning null keeps iframe construction and submission validation on the
 * same allowlist.
 *
 * @param {string | null | undefined} value
 * @returns {string | null}
 */
export function youtubeVideoId(value) {
	if (!value) return null;
	let url;
	try {
		url = new URL(value);
	} catch {
		return null;
	}
	if (url.protocol !== 'https:' || !YOUTUBE_HOSTS.has(url.hostname.toLowerCase())) return null;

	let candidate = '';
	if (url.hostname.toLowerCase().endsWith('youtu.be')) {
		candidate = url.pathname.split('/').filter(Boolean)[0] ?? '';
	} else if (url.pathname === '/watch') {
		candidate = url.searchParams.get('v') ?? '';
	} else {
		const [kind, id] = url.pathname.split('/').filter(Boolean);
		if (['embed', 'shorts', 'live'].includes(kind)) candidate = id ?? '';
	}

	return VIDEO_ID.test(candidate) ? candidate : null;
}

/** @param {string | null | undefined} value */
export function youtubeEmbedUrl(value) {
	const id = youtubeVideoId(value);
	return id ? `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&playsinline=1` : null;
}
