import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAntiBot } from './antiBot.svelte.js';

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(new Date('2026-08-26T12:00:00Z'));
});

afterEach(() => {
	vi.useRealTimers();
});

describe('createAntiBot', () => {
	it('measures dwell time from form creation without requiring field input', () => {
		const antiBot = createAntiBot();

		expect(antiBot.elapsedMs).toBe(0);
		vi.advanceTimersByTime(2000);
		expect(antiBot.elapsedMs).toBe(2000);
	});

	it('does not restart the clock when a field interaction is recorded', () => {
		const antiBot = createAntiBot();

		vi.advanceTimersByTime(1000);
		antiBot.touch();
		vi.advanceTimersByTime(750);

		expect(antiBot.elapsedMs).toBe(1750);
	});

	it('starts a fresh dwell window when the form is reset', () => {
		const antiBot = createAntiBot();
		antiBot.honeypot = 'filled';
		vi.advanceTimersByTime(3000);

		antiBot.reset();

		expect(antiBot.honeypot).toBe('');
		expect(antiBot.elapsedMs).toBe(0);
		vi.advanceTimersByTime(1600);
		expect(antiBot.elapsedMs).toBe(1600);
	});
});
