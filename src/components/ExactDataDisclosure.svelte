<script>
	/** @type {{ value: unknown }} */
	let { value } = $props();

	const json = $derived(JSON.stringify(value, null, 2));
</script>

<details class="exact-data">
	<summary>See the exact data</summary>
	<div class="exact-data-scroll">
		<pre><code>{json}</code></pre>
	</div>
</details>

<style>
	.exact-data {
		width: min(100%, 62ch);
		min-width: 0;
		overflow: hidden;
		margin-bottom: 2rem;
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--bg-elevated);
	}

	summary {
		padding: 0.9rem 1.1rem;
		cursor: pointer;
		font-size: var(--text-sm);
		font-weight: 600;
	}

	.exact-data[open] summary {
		border-bottom: 1px solid var(--border);
	}

	.exact-data-scroll {
		max-width: 100%;
		overflow-x: auto;
		overscroll-behavior-inline: contain;
	}

	pre {
		box-sizing: border-box;
		width: max-content;
		min-width: 100%;
		margin: 0;
		padding: 1rem 1.1rem;
		background: color-mix(in srgb, var(--bg) 45%, transparent);
		font-size: var(--text-sm);
		line-height: 1.5;
	}
</style>
