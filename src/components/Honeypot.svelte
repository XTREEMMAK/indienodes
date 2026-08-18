<script>
	/**
	 * Named like something a bot expects to find, hidden from sight and from
	 * assistive tech, and never focusable by keyboard, so no real submitter
	 * can fill it by accident. Shared across every local webhook-backed form
	 * (`/join`, `/update`, `/contact`) — see `antiBot.svelte.js` for the
	 * dwell-timer half of the same anti-bot pair.
	 *
	 * `id` is a prop rather than a hardcoded `f-website` because more than
	 * one instance can now exist on a page's lifetime of routes; each caller
	 * picks its own to keep the `<label for>` pairing valid.
	 * @type {{ value: string, id?: string }}
	 */
	let { value = $bindable(''), id = 'f-website' } = $props();
</script>

<div class="sr-only" aria-hidden="true">
	<label for={id}>Website</label>
	<input {id} type="text" tabindex="-1" autocomplete="off" bind:value />
</div>
