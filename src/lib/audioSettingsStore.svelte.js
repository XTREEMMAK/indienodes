/**
 * Output level for every element in the app that makes sound.
 *
 * Deliberately its own store rather than part of `audioPlayerStore`, keeping
 * that store's stated boundary intact: the queue owns *what is queued and
 * where playback is in it*, and a listener's chosen level is neither. It is a
 * property of this device's playback, which is also why it is the one piece
 * of player state worth persisting when the queue itself is not.
 *
 * It is a *store* rather than component state on `AudioPlayer.svelte`, where
 * it used to live, because that component is no longer the only thing that
 * plays audio. Ambient view owns a third element (its one-off discovery
 * preview) that a visitor hears through the same speakers, and with the value
 * trapped in a sibling component that element had no way to read it: every
 * ambient preview played at full volume regardless of where the slider was
 * set, including when the player was muted. Two elements honouring the
 * setting and a third ignoring it is not a volume control.
 *
 * `muted` is session state and not persisted, matching the behaviour this had
 * as component state: a mute is "silence this right now," and restoring one
 * on a later visit would present as an app that plays nothing.
 */

import { STORAGE_KEYS } from './storageKeys.js';

const VOLUME_KEY = STORAGE_KEYS.volume.key;

function createAudioSettingsStore() {
	let volume = $state(1);
	let muted = $state(false);
	/** Volume before the last mute, so unmuting returns to where it was. */
	let volumeBeforeMute = 1;

	return {
		get volume() {
			return volume;
		},
		get muted() {
			return muted;
		},

		/**
		 * What an element's `.volume` should actually be set to. Every consumer
		 * reads this rather than combining the two values itself, so "muted
		 * means zero" is stated once instead of at each element.
		 */
		get outputVolume() {
			return muted ? 0 : volume;
		},

		/**
		 * Restores the persisted level. Called from a mounted component rather
		 * than at module scope: this module is imported during SSR, where
		 * `localStorage` does not exist.
		 */
		load() {
			/** @type {string | null} */
			let stored;
			try {
				stored = localStorage.getItem(VOLUME_KEY);
			} catch {
				// Private mode can refuse reads as well as writes.
				return;
			}
			if (stored === null) return;
			const parsed = Number(stored);
			if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 1) {
				volume = parsed;
				volumeBeforeMute = parsed || 1;
			}
		},

		/** @param {number} value */
		setVolume(value) {
			if (!Number.isFinite(value)) return;
			const clamped = Math.min(1, Math.max(0, value));
			volume = clamped;
			muted = clamped === 0;
			if (clamped > 0) volumeBeforeMute = clamped;
			try {
				localStorage.setItem(VOLUME_KEY, String(clamped));
			} catch {
				// Private mode or a full quota: volume just will not persist.
			}
		},

		toggleMute() {
			if (muted || volume === 0) {
				muted = false;
				volume = volumeBeforeMute || 1;
			} else {
				volumeBeforeMute = volume;
				muted = true;
			}
		}
	};
}

export const audioSettingsStore = createAudioSettingsStore();
