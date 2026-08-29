<script>
	// A node with no entry to show: either its type has nothing in the ring
	// yet, or every matching entry is already on screen in another node.
	//
	// This exists so a node is never invisible. Rendering nothing when a node
	// had no content made it possible to add a node and then have no way to
	// select or delete it, since its configuration lives on the node itself.
	// It also quietly misrepresented the ring as smaller than it is.
	//
	// Prose in line comments and the type on one line: see the note in
	// NodeConfig.svelte for why a multi-line block comment here breaks the
	// production build while passing every other check.

	import { resolve } from '$app/paths';

	/**
	 * `cause` (brief section 7c) distinguishes why this slot has nothing:
	 * `'ring-empty'` means the ring itself doesn't have enough of this type
	 * yet, `'hidden-exhausted'` means it does, but the visitor's own Not for
	 * Me list is what emptied the pool, and `null`/omitted keeps the original
	 * generic message (every matching entry is already on screen elsewhere).
	 * Always `null` while arranging; that branch is unrelated to pool state.
	 * @type {{ node: { id: string, type: 'audio'|'comic'|'text'|'game'|'art'|'any', x: number, y: number, w: number, h: number }, editMode?: boolean, cause?: 'ring-empty' | 'hidden-exhausted' | null }}
	 */
	let { node, editMode = false, cause = null } = $props();

	const LABEL = {
		audio: 'audio',
		comic: 'comic',
		text: 'writing',
		game: 'game',
		art: 'art',
		any: 'ring'
	};
</script>

<div class="empty-node" data-type={node.type} style:--node-aspect={`${node.w} / ${node.h}`}>
	<p class="message">
		{#if editMode}
			Nothing to show here yet. Pick another type, or leave it: it fills in as the ring grows.
		{:else if cause === 'ring-empty'}
			The ring doesn't have any {LABEL[node.type]} entries yet.
		{:else if cause === 'hidden-exhausted'}
			Your Not for Me list is why this is empty. Restore some from
			<a href={resolve('/lists')}>Lists</a>, or wait for more members to join.
		{:else}
			No {LABEL[node.type]} to show right now.
		{/if}
	</p>
</div>

<style>
	.empty-node {
		--node-color: var(--type-audio);
		display: flex;
		align-items: center;
		justify-content: center;
		height: 100%;
		aspect-ratio: var(--node-aspect, 1 / 1);
		padding: 1.2rem;
		text-align: center;
		border-radius: var(--radius-lg);
		/* Dashed rather than solid, and un-tinted: a placeholder should read
		   as an absence, not as another card competing for attention. */
		border: 1px dashed var(--border);
		background: color-mix(in oklch, var(--node-color) 6%, transparent);
	}

	.empty-node[data-type='game'] {
		--node-color: var(--type-game);
	}
	.empty-node[data-type='comic'] {
		--node-color: var(--type-comic);
	}
	.empty-node[data-type='text'] {
		--node-color: var(--type-text);
	}
	.empty-node[data-type='art'] {
		--node-color: var(--type-art);
	}
	.empty-node[data-type='any'] {
		--node-color: var(--text-muted);
	}

	.message {
		margin: 0;
		max-width: 26ch;
		color: var(--text-muted);
		font-size: var(--text-xs);
	}

	.message a {
		color: var(--accent);
	}

	.message a:hover {
		text-decoration: underline;
	}
</style>
