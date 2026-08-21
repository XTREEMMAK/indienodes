<script>
	import FieldNode from '../components/FieldNode.svelte';
	import { NODE_SKINS, UI_SKINS } from '../skins/registry.js';
	import { skinStore } from '../skins/skinStore.svelte.js';
	import { SKIN_LAB_ENTRIES, withoutLabArtwork } from '../skins/devFixtures.js';

	let paused = $state(false);
	let motionReduced = $state(false);
	let showArtwork = $state(true);
	let aspect = $state('1 / 1');
	const entries = $derived(
		showArtwork ? SKIN_LAB_ENTRIES : SKIN_LAB_ENTRIES.map(withoutLabArtwork)
	);
</script>

<svelte:head>
	<title>Skin Laboratory | IndieNodes</title>
</svelte:head>

<main class="skin-lab">
	<header>
		<p class="eyebrow">Developer surface</p>
		<h1>Skin Laboratory</h1>
		<p>
			Exercise every entry type against the real card host, services, accessibility controls, and
			fallback behavior. Changes here use the same persisted skin selection as Settings.
		</p>
	</header>

	<section class="controls" aria-label="Skin laboratory controls">
		<label>
			<span>UI skin</span>
			<select
				value={skinStore.uiSkin}
				onchange={(event) => skinStore.setUiSkin(event.currentTarget.value)}
			>
				{#each UI_SKINS as skin (skin.id)}
					<option value={skin.id}>{skin.label}</option>
				{/each}
			</select>
		</label>
		<label>
			<span>Node skin</span>
			<select
				value={skinStore.nodeSkin}
				onchange={(event) => skinStore.setNodeSkin(event.currentTarget.value)}
			>
				{#each NODE_SKINS as skin (skin.id)}
					<option value={skin.id}>{skin.label}</option>
				{/each}
			</select>
		</label>
		<label>
			<span>Card aspect</span>
			<select bind:value={aspect}>
				<option value="1 / 1">Square</option>
				<option value="4 / 3">Landscape</option>
				<option value="3 / 4">Portrait</option>
			</select>
		</label>
		<label class="check"><input type="checkbox" bind:checked={paused} /> Pause timed content</label>
		<label class="check"
			><input type="checkbox" bind:checked={motionReduced} /> Simulate reduced motion</label
		>
		<label class="check"><input type="checkbox" bind:checked={showArtwork} /> Include artwork</label
		>
	</section>

	<section class="cards" aria-label="Skin examples">
		{#each entries as entry (entry.id)}
			<div class="example" style:aspect-ratio={aspect}>
				<FieldNode
					{entry}
					progress={0.62}
					progressPaused={paused}
					{aspect}
					motionReducedOverride={motionReduced}
				/>
			</div>
		{/each}
	</section>
</main>

<style>
	.skin-lab {
		width: min(92rem, calc(100% - 2rem));
		margin: 0 auto;
		padding: 7rem 0 5rem;
	}

	header {
		max-width: 68rem;
		margin-bottom: 2rem;
	}

	.eyebrow {
		color: var(--accent);
		font-size: var(--text-sm);
		font-weight: 800;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}

	header p:last-child {
		color: var(--text-muted);
	}

	.controls {
		display: flex;
		flex-wrap: wrap;
		align-items: end;
		gap: 1rem 1.5rem;
		padding: 1.25rem;
		margin-bottom: 2rem;
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--bg-elevated);
	}

	.controls label:not(.check) {
		display: grid;
		gap: 0.35rem;
		min-width: 14rem;
		font-size: var(--text-sm);
		font-weight: 700;
	}

	select {
		padding: 0.55rem 0.7rem;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--bg);
		color: var(--text);
		font: inherit;
	}

	.check {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: var(--text-sm);
	}

	.cards {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 20rem), 1fr));
		gap: 1.5rem;
		align-items: start;
	}

	.example {
		min-width: 0;
	}
</style>
