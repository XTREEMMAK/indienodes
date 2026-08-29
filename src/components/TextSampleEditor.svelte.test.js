import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import TextSampleEditor from './TextSampleEditor.svelte';

const ALLOWED_TOOLS = [
	'Heading 1',
	'Heading 2',
	'Heading 3',
	'Paragraph',
	'Bold',
	'Italic',
	'Underline',
	'Strikethrough',
	'Undo',
	'Redo',
	'Paste plain text'
];

afterEach(() => vi.restoreAllMocks());

describe('TextSampleEditor', () => {
	it('shows only the work-sample tools and has no selection popup', async () => {
		const screen = await render(TextSampleEditor, { body: '<p>Sample text.</p>' });

		for (const name of ALLOWED_TOOLS) {
			await expect.element(screen.getByRole('button', { name })).toBeInTheDocument();
		}
		expect(document.querySelectorAll('.text-sample-controller button')).toHaveLength(
			ALLOWED_TOOLS.length
		);
		expect(document.querySelector('.tipex-floating-group')).toBeNull();
		expect(document.querySelector('[aria-label="Inline Code"]')).toBeNull();
		expect(document.querySelector('[aria-label="Bullet List"]')).toBeNull();
		expect(document.querySelector('[aria-label="Edit link"]')).toBeNull();
	});

	it('pastes clipboard content as text rather than executable or formatted HTML', async () => {
		const onUpdate = vi.fn();
		vi.spyOn(navigator.clipboard, 'readText').mockResolvedValue(
			'<strong>Clipboard markup</strong>\nSecond line'
		);
		const screen = await render(TextSampleEditor, { body: '<p>Start: </p>', onUpdate });

		await screen.getByRole('button', { name: 'Paste plain text' }).click();
		await vi.waitFor(() => {
			const html = onUpdate.mock.lastCall?.[0] ?? '';
			expect(html).toContain('&lt;strong&gt;Clipboard markup&lt;/strong&gt;');
			expect(html).toContain('Second line');
			expect(html).not.toContain('<strong>Clipboard markup</strong>');
		});
	});
});
