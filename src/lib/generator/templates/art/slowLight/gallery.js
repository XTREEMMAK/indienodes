const slides = [...document.querySelectorAll('.slide')];
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let index = 0;

if (!reduced && slides.length > 1) {
	setInterval(() => {
		slides[index].classList.remove('active');
		index = (index + 1) % slides.length;
		slides[index].classList.add('active');
	}, 7500);
}
