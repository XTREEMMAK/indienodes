<script>
	// A node's own configuration, reachable only while arranging.
	//
	// Everything past "this node exists" is behind a three-dot menu rather
	// than laid out on the card. Arrange mode is for placing and sizing, and
	// a permanently visible type dropdown plus a Remove button on every card
	// turned a field of artwork into a field of forms. The menu keeps the
	// affordance one tap away without occupying the card to say so.
	//
	// Shared between a node showing content and a node that has none, because
	// a node with an empty pool still has to be movable, retypeable, and above
	// all removable. An earlier version rendered the whole node only when it
	// had an entry, which made it possible to add a node and then be unable to
	// delete it.
	//
	// Type and tags are the whole of the configuration: what this channel
	// shows, and which slice of it. Tags are offered only where they can lead
	// somewhere — the list is scoped to the node's current type, so a comic
	// node is never offered a tag only audio entries carry.
	//
	// Prose in line comments and the type on one line: a multi-line block
	// comment here gets hoisted into a `var` declaration in the emitted JS
	// and breaks the production build while passing every other check.

	import { ringStore } from '$lib/ringStore.svelte.js';
	import { tagsForType } from '$lib/nodeChannel.js';

	/** @type {{ nodeId: string, nodeType: 'audio'|'comic'|'text'|'game'|'art'|'any', nodeTags?: string[], onTypeChange?: (type: any) => void, onTagsChange?: (tags: string[]) => void, onRemove?: () => void }} */
	let { nodeId, nodeType, nodeTags = [], onTypeChange, onTagsChange, onRemove } = $props();

	let open = $state(false);
	let rootEl = $state(/** @type {HTMLElement | undefined} */ (undefined));

	// The catalogue is a read-only fact about the ring rather than node state,
	// so it is read here instead of being threaded down as a third prop
	// through FieldSlot. What the node has *selected* stays a prop, owned by
	// the layout store like the rest of the node's configuration.
	const availableTags = $derived(tagsForType(ringStore.entries, nodeType));

	/** @param {string} tag */
	function toggleTag(tag) {
		const next = nodeTags.includes(tag)
			? nodeTags.filter((existing) => existing !== tag)
			: [...nodeTags, tag];
		onTagsChange?.(next);
	}

	// Handler lives here rather than inline in the markup. An inline JSDoc
	// cast (`/** @type {...} */ (expr)`) inside a template attribute is what
	// rolldown fails to parse; the identical cast is fine inside a script
	// block. svelte-check and the Svelte compiler accept both, so only
	// `npm run build` catches it. See docs/decisions.md.
	/** @param {Event} event */
	function handleTypeChange(event) {
		const select = /** @type {HTMLSelectElement} */ (event.currentTarget);
		onTypeChange?.(select.value);
	}

	$effect(() => {
		if (!open) return;

		/** @param {PointerEvent} event */
		function handlePointerDown(event) {
			const target = /** @type {Node} */ (event.target);
			if (rootEl && !rootEl.contains(target)) open = false;
		}
		/** @param {KeyboardEvent} event */
		function handleKey(event) {
			if (event.key === 'Escape') open = false;
		}

		document.addEventListener('pointerdown', handlePointerDown, true);
		document.addEventListener('keydown', handleKey);
		return () => {
			document.removeEventListener('pointerdown', handlePointerDown, true);
			document.removeEventListener('keydown', handleKey);
		};
	});
</script>

<div class="node-config" bind:this={rootEl}>
	<button
		type="button"
		class="menu-toggle"
		aria-haspopup="menu"
		aria-expanded={open}
		aria-label="Node options"
		onclick={() => (open = !open)}
	>
		<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
			<circle cx="5" cy="12" r="1.8" />
			<circle cx="12" cy="12" r="1.8" />
			<circle cx="19" cy="12" r="1.8" />
		</svg>
	</button>

	{#if open}
		<div class="menu" role="menu">
			<label class="field">
				<span class="field-label">Shows</span>
				<select id="type-{nodeId}" class="type-select" value={nodeType} onchange={handleTypeChange}>
					<option value="audio">Audio</option>
					<option value="comic">Comic</option>
					<option value="art">Art</option>
					<option value="text">Text</option>
					<option value="game">Game</option>
					<option value="any">Any</option>
				</select>
			</label>

			{#if availableTags.length > 0}
				<div class="field">
					<span class="field-label" id="tags-label-{nodeId}">Tagged</span>
					<div class="chip-group tag-chips" role="group" aria-labelledby="tags-label-{nodeId}">
						{#each availableTags as tag (tag)}
							<label class="chip" class:checked={nodeTags.includes(tag)}>
								<input
									type="checkbox"
									checked={nodeTags.includes(tag)}
									onchange={() => toggleTag(tag)}
								/>
								<span>{tag}</span>
							</label>
						{/each}
					</div>
					{#if nodeTags.length > 0}
						<button type="button" class="clear-tags" onclick={() => onTagsChange?.([])}>
							Clear tags
						</button>
					{:else}
						<small class="tag-hint">Showing every tag.</small>
					{/if}
				</div>
			{/if}

			<button
				type="button"
				class="remove-button"
				onclick={() => {
					open = false;
					onRemove?.();
				}}
			>
				Remove node
			</button>
		</div>
	{/if}
</div>

<style>
	/* Top-right, which is free during arrange because the card hides its
	   badge and like toggle then. Those used to sit on this exact spot and
	   rendered above the configuration bar, so the like button covered the
	   Remove control underneath it. */
	.node-config {
		position: absolute;
		top: 0.5rem;
		right: 0.5rem;
		z-index: 5;
	}

	.menu-toggle {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 2rem;
		height: 2rem;
		border-radius: 999px;
		border: 1px solid var(--glass-border);
		background: color-mix(in oklch, var(--bg-elevated) 92%, transparent);
		backdrop-filter: blur(6px);
		color: var(--text);
		cursor: pointer;
	}

	.menu-toggle:hover {
		border-color: var(--accent);
		color: var(--accent);
	}

	/* Escapes the card deliberately: `.node` clips its own overflow, but this
	   component is a sibling of the card inside the slot, so the menu can
	   extend past a small node instead of being cut off by it. */
	.menu {
		position: absolute;
		top: 2.4rem;
		right: 0;
		z-index: 6;
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		min-width: 13rem;
		max-width: 17rem;
		padding: 0.7rem;
		border-radius: var(--radius-md);
		border: 1px solid var(--glass-border);
		background: var(--bg-elevated);
		box-shadow: var(--glass-shadow);
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.field-label {
		color: var(--text-muted);
		font-size: var(--text-xs);
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}

	.type-select {
		width: 100%;
		padding: 0.3rem 0.4rem;
		border-radius: var(--radius-sm);
		border: 1px solid var(--border);
		background: var(--bg);
		color: var(--text);
		font: inherit;
		font-size: var(--text-xs);
	}

	/* Reuses the shared `.chip` pill from app.css rather than a second chip
	   design, resized for a menu that sits on top of a node instead of on a
	   settings page. Scrolls rather than growing without limit: a ring with
	   forty tags would otherwise make this menu taller than the field. */
	.tag-chips {
		gap: 0.35rem;
		max-height: 8.5rem;
		overflow-y: auto;
		overscroll-behavior: contain;
	}

	.tag-chips :global(.chip) {
		gap: 0.3rem;
		padding: 0.2rem 0.55rem;
		font-size: var(--text-xs);
	}

	.tag-hint {
		color: var(--text-muted);
		font-size: var(--text-xs);
	}

	.clear-tags {
		align-self: flex-start;
		padding: 0.1rem 0;
		text-align: left;
		border: none;
		background: none;
		color: var(--text-muted);
		font: inherit;
		font-size: var(--text-xs);
		text-decoration: underline;
		cursor: pointer;
	}

	.clear-tags:hover {
		color: var(--text);
	}

	.remove-button {
		text-align: left;
		background: none;
		border: none;
		padding: 0.25rem 0;
		font: inherit;
		font-size: var(--text-xs);
		font-weight: 600;
		color: var(--text-muted);
		cursor: pointer;
	}

	.remove-button:hover {
		color: #e0455f;
	}
</style>
