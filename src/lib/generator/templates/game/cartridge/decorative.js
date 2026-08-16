// The Play button is a placeholder target in the template's own preview;
// the real export wires it to the ring's source_url once one exists,
// which is why this stays a no-op rather than a real href here.
(function () {
	var button = document.querySelector('[data-role="visit"]');
	if (button)
		button.addEventListener('click', function (e) {
			e.preventDefault();
		});
})();
