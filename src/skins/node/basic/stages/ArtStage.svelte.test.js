import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import FieldNode from '../../../../components/FieldNode.svelte';
import ArtStage from './ArtStage.svelte';

const ARTWORK_INTERVAL_MS = 6800;
const TICK_MS = 120;

/** @type {import('../../../../lib/ring.js').RingEntry} */
const ENTRY = {
	id: 'art-stage-test',
	creator: 'Test Studio',
	type: 'art',
	why: 'Art stage rotation fixture.',
	source_url: 'https://example.com/art',
	tags: ['test'],
	artworks: [
		{
			image_url: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>',
			alt: 'First artwork'
		},
		{
			image_url: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>',
			alt: 'Second artwork'
		}
	],
	verification_token: 'test'
};

afterEach(() => {
	vi.useRealTimers();
});

describe('ArtStage artwork rotation', () => {
	it('cycles through an entry’s artworks while the Field stage is active', async () => {
		vi.useFakeTimers();
		const onStageProgressChange = vi.fn();
		const screen = await render(ArtStage, {
			entry: ENTRY,
			paused: false,
			motionReduced: false,
			onStageProgressChange
		});

		await expect.element(screen.getByAltText('First artwork')).toBeInTheDocument();
		expect(onStageProgressChange).toHaveBeenLastCalledWith(0);
		await vi.advanceTimersByTimeAsync(ARTWORK_INTERVAL_MS / 2);
		const halfway = onStageProgressChange.mock.lastCall?.[0];
		expect(halfway).toBeGreaterThan(0.4);
		expect(halfway).toBeLessThan(0.6);
		await vi.advanceTimersByTimeAsync(ARTWORK_INTERVAL_MS);
		await expect.element(screen.getByAltText('Second artwork')).toBeInTheDocument();
	});

	it('holds the current artwork while the Field slot is paused', async () => {
		vi.useFakeTimers();
		const screen = await render(ArtStage, {
			entry: ENTRY,
			paused: true,
			motionReduced: false
		});

		await vi.advanceTimersByTimeAsync(ARTWORK_INTERVAL_MS * 2);
		await expect.element(screen.getByAltText('First artwork')).toBeInTheDocument();
	});

	it('supplies the visible Field node bar when no outer creator timer exists', async () => {
		vi.useFakeTimers();
		await render(FieldNode, {
			entry: ENTRY,
			ambient: true,
			progress: null,
			motionReducedOverride: false
		});

		await vi.advanceTimersByTimeAsync(TICK_MS);
		const track = document.querySelector('.node[data-type="art"] .progress-track');
		const fill = /** @type {HTMLElement | null} */ (track?.querySelector('.progress-fill'));
		expect(track).toBeInstanceOf(HTMLElement);
		expect(Number.parseFloat(fill?.style.width ?? '')).toBeCloseTo(
			(TICK_MS / ARTWORK_INTERVAL_MS) * 100,
			4
		);
	});
});
