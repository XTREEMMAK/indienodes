(function () {
	// Theme toggle: dark is the page's own default (no attribute needed for
	// it), so this only ever sets data-theme to 'light', never 'dark' — that
	// keeps "no stored choice yet" and "chose dark" indistinguishable, which
	// is correct, since dark is what a first visit already looks like either
	// way. The choice persists across visits via localStorage; a private
	// window or a disabled localStorage just means every visit defaults dark
	// again, which is a reasonable fallback, not a broken one.
	var STORAGE_KEY = 'indienode-theme';
	var root = document.documentElement;
	var toggle = document.querySelector('[data-role="theme-toggle"]');

	function applyTheme(theme) {
		if (theme === 'light') {
			root.setAttribute('data-theme', 'light');
			if (toggle) toggle.setAttribute('aria-label', 'Switch to dark theme');
		} else {
			root.removeAttribute('data-theme');
			if (toggle) toggle.setAttribute('aria-label', 'Switch to light theme');
		}
	}

	try {
		var stored = localStorage.getItem(STORAGE_KEY);
		if (stored === 'light') applyTheme('light');
	} catch {
		// Private browsing or a disabled localStorage: the toggle below still
		// works for the rest of this visit, it just won't be remembered.
	}

	if (toggle) {
		toggle.addEventListener('click', function () {
			var next = root.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
			applyTheme(next);
			try {
				localStorage.setItem(STORAGE_KEY, next);
			} catch {
				// Same as above: nothing to do if storage isn't available.
			}
		});
	}

	// Shrinks the artist name only if styles.css's large default size would
	// otherwise overflow .reveal-mask — a single long unbreakable "word"
	// (a one-word stage name, a hyphenated band name) that the CSS clamp
	// alone can't safely account for, since it can only respond to
	// viewport width, not to how wide a *specific* creator's own name
	// renders. Without this, the mask's own overflow:hidden (needed for
	// the rise-from-the-mask animation) would silently clip characters off
	// the end rather than shrink to show all of them. One-directional and
	// deliberately simple: it only ever shrinks from the CSS default,
	// never grows past it, and re-checks on resize since which names
	// overflow depends on the viewport too.
	function fitArtistName() {
		var mask = document.querySelector('.reveal-mask');
		var text = document.querySelector('.reveal-text');
		if (!mask || !text) return;
		text.style.fontSize = '';
		var available = mask.clientWidth;
		var natural = text.scrollWidth;
		if (!available || natural <= available) return;
		var base = parseFloat(getComputedStyle(text).fontSize);
		text.style.fontSize = base * (available / natural) + 'px';
	}
	fitArtistName();

	var resizeTimer;
	window.addEventListener('resize', function () {
		clearTimeout(resizeTimer);
		resizeTimer = setTimeout(fitArtistName, 150);
	});

	// Starts each "MY MUSIC" background row's fast entrance — two rows,
	// see .marquee-rows in styles.css, running in opposite directions —
	// the instant its own burst reaches its own loop's starting position
	// (see styles.css's long comment on why the two keyframes are built to
	// match velocity exactly at that handoff). animationend, not a fixed
	// timeout, so it stays exact even if a browser's own timer throttling
	// nudges the burst's real duration a few ms off its nominal 3.6s.
	var marqueeTracks = document.querySelectorAll('.marquee-track');
	function startMarquee() {
		marqueeTracks.forEach(function (track) {
			track.addEventListener(
				'animationend',
				function () {
					track.classList.remove('burst');
					track.classList.add('loop');
				},
				{ once: true }
			);
			track.classList.add('burst');
		});
	}

	// Tracks rise into view once, the first time the tracklist is scrolled
	// into the viewport — not on every scroll back into view, which would
	// read as the page constantly re-animating at the visitor rather than a
	// one-time entrance. Each <li>'s own --i (set at render time, see
	// index.js) staggers its animation-delay in CSS. The marquee starts on
	// the same trigger: both read as "you've reached the tracks section."
	var tracklist = document.querySelector('.tracklist');
	if (tracklist) {
		if ('IntersectionObserver' in window) {
			var observer = new IntersectionObserver(
				function (entries) {
					entries.forEach(function (entry) {
						if (entry.isIntersecting) {
							tracklist.classList.add('in-view');
							startMarquee();
							observer.disconnect();
						}
					});
				},
				{ threshold: 0.15 }
			);
			observer.observe(tracklist);
		} else {
			tracklist.classList.add('in-view');
			startMarquee();
		}
	}
})();
