import { describe, expect, it } from 'vitest';
import { sanitizeAccentColor, sanitizeFontFamily } from './widgetTheme.js';

describe('sanitizeAccentColor', () => {
	it('accepts common color syntaxes', () => {
		for (const value of [
			'#b5502f',
			'#FFF',
			'rgb(181, 80, 47)',
			'rgba(181, 80, 47, 0.5)',
			'hsl(14deg 61% 45%)',
			'cornflowerblue'
		]) {
			expect(sanitizeAccentColor(value)).toBe(value);
		}
	});

	it('trims surrounding whitespace', () => {
		expect(sanitizeAccentColor('  #b5502f  ')).toBe('#b5502f');
	});

	it('rejects empty, missing, and whitespace-only input', () => {
		expect(sanitizeAccentColor('')).toBeUndefined();
		expect(sanitizeAccentColor('   ')).toBeUndefined();
		expect(sanitizeAccentColor(null)).toBeUndefined();
		expect(sanitizeAccentColor(undefined)).toBeUndefined();
	});

	it('rejects anything outside the color character set', () => {
		for (const value of [
			'red; background: url(https://evil.example/track.png)',
			'</style><script>alert(1)</script>',
			'url(javascript:alert(1))',
			'red}body{display:none'
		]) {
			expect(sanitizeAccentColor(value)).toBeUndefined();
		}
	});

	it('rejects an implausibly long value', () => {
		expect(sanitizeAccentColor('a'.repeat(65))).toBeUndefined();
	});
});

describe('sanitizeFontFamily', () => {
	it('accepts unquoted keywords and quoted family names', () => {
		for (const value of [
			'sans-serif',
			'system-ui',
			'"Comic Sans MS", sans-serif',
			"'Fira Code', monospace"
		]) {
			expect(sanitizeFontFamily(value)).toBe(value);
		}
	});

	it('rejects anything outside the font character set', () => {
		for (const value of ['sans-serif; }</style><script>alert(1)</script>', 'url(evil.example)']) {
			expect(sanitizeFontFamily(value)).toBeUndefined();
		}
	});

	it('rejects an implausibly long value', () => {
		expect(sanitizeFontFamily('a'.repeat(129))).toBeUndefined();
	});
});
