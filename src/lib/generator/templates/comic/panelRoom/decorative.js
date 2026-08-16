(function () {
	var lightbox = document.getElementById('lightbox');
	var lightboxImg = document.getElementById('lightbox-img');
	document.querySelectorAll('.panel-button img').forEach(function (img) {
		img.closest('.panel-button').addEventListener('click', function () {
			lightboxImg.src = img.src;
			lightboxImg.alt = img.alt;
			lightbox.hidden = false;
		});
	});
	function close() {
		lightbox.hidden = true;
		lightboxImg.src = '';
	}
	lightbox.querySelector('.lightbox-close').addEventListener('click', close);
	lightbox.addEventListener('click', function (e) {
		if (e.target === lightbox) close();
	});
	document.addEventListener('keydown', function (e) {
		if (e.key === 'Escape') close();
	});
})();
