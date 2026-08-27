import { describe, expect, it } from 'vitest';
import {
	safeExternalHref,
	socialLinksHtml,
	socialLinksIconHtml,
	socialLinksIconOnlyHtml
} from './shared.js';

describe('generated external links', () => {
	it('allows HTTPS and mail links while rejecting executable and data schemes', () => {
		expect(safeExternalHref('https://example.com/path')).toBe('https://example.com/path');
		expect(safeExternalHref('mailto:artist@example.com')).toBe('mailto:artist@example.com');
		expect(safeExternalHref('javascript:alert(1)')).toBeNull();
		expect(safeExternalHref('data:text/html,<script>alert(1)</script>')).toBeNull();
	});

	it.each([socialLinksHtml, socialLinksIconHtml, socialLinksIconOnlyHtml])(
		'omits unsafe hrefs from every social-link renderer',
		(render) => {
			const html = render([
				{ label: 'Safe', url: 'https://example.com' },
				{ label: 'Poisoned', url: 'javascript:alert(1)' }
			]);
			expect(html).toContain('https://example.com/');
			expect(html).not.toContain('javascript:');
			expect(html).not.toContain('Poisoned');
		}
	);
});
