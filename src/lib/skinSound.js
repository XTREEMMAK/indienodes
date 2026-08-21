/**
 * Plays a short skin sound after a skin-owned user interaction. The host
 * owns this operation so skins never create persistent audio graphs or bypass
 * browser playback policy. Callers must invoke it directly from an input
 * event, never from mount, timers, observers, or reactive effects.
 * @param {string} url
 * @param {{ volume?: number }} [options]
 */
export async function playSkinSound(url, options = {}) {
	if (!url) return false;
	const audio = new Audio(url);
	audio.preload = 'auto';
	audio.volume = Math.min(1, Math.max(0, options.volume ?? 0.4));
	try {
		await audio.play();
		return true;
	} catch {
		return false;
	}
}
