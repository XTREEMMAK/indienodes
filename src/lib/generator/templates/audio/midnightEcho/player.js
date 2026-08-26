const players = /** @type {HTMLElement[]} */ ([...document.querySelectorAll('.track-player')]);

/** @param {number} value */
function formatTime(value) {
	if (!Number.isFinite(value)) return '--:--';
	const minutes = Math.floor(value / 60);
	const seconds = Math.floor(value % 60)
		.toString()
		.padStart(2, '0');
	return `${minutes}:${seconds}`;
}

for (const player of players) {
	const audio = /** @type {HTMLAudioElement | null} */ (player.querySelector('audio'));
	const toggle = /** @type {HTMLButtonElement | null} */ (player.querySelector('.player-toggle'));
	const seek = /** @type {HTMLInputElement | null} */ (player.querySelector('.player-seek'));
	const current = /** @type {HTMLElement | null} */ (player.querySelector('.player-current'));
	const duration = /** @type {HTMLElement | null} */ (player.querySelector('.player-duration'));
	if (!audio || !toggle || !seek || !current || !duration) continue;

	audio.addEventListener('loadedmetadata', () => {
		seek.max = String(audio.duration || 0);
		duration.textContent = formatTime(audio.duration);
	});
	audio.addEventListener('timeupdate', () => {
		seek.value = String(audio.currentTime);
		current.textContent = formatTime(audio.currentTime);
	});
	audio.addEventListener('play', () => {
		for (const other of players) {
			const otherAudio = /** @type {HTMLAudioElement | null} */ (other.querySelector('audio'));
			if (otherAudio && otherAudio !== audio) otherAudio.pause();
		}
		player.dataset.playing = 'true';
		toggle.setAttribute('aria-label', 'Pause track');
	});
	audio.addEventListener('pause', () => {
		delete player.dataset.playing;
		toggle.setAttribute('aria-label', 'Play track');
	});
	audio.addEventListener('ended', () => {
		audio.currentTime = 0;
	});
	toggle.addEventListener('click', () => {
		if (audio.paused) audio.play();
		else audio.pause();
	});
	seek.addEventListener('input', () => {
		audio.currentTime = Number(seek.value);
	});
}
