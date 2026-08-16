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

	/** @type {{ node: { id: string, type: 'audio'|'comic'|'text'|'game'|'any', x: number, y: number, w: number, h: number }, editMode?: boolean }} */
	let { node, editMode = false } = $props();

	const LABEL = {
		audio: 'audio',
		comic: 'comic',
		text: 'writing',
		game: 'game',
		any: 'ring'
	};
</script>

<div class="empty-node" data-type={node.type} style:--node-aspect={`${node.w} / ${node.h}`}>
	<p class="message">
		{#if editMode}
			Nothing to show here yet. Pick another type, or leave it: it fills in as the ring grows.
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
	.empty-node[data-type='any'] {
		--node-color: var(--text-muted);
	}

	.message {
		margin: 0;
		max-width: 22ch;
		color: var(--text-muted);
		font-size: var(--text-xs);
	}
</style>
