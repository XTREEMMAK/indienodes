<script>
	/**
	 * Generic dialog: backdrop, Escape to close, click-outside to close,
	 * body scroll lock while open, and focus moved onto the dialog on open.
	 * Content-agnostic on purpose, so About (and anything else that wants a
	 * modal instead of a full route) can share the same mechanics.
	 */
	import { fade } from 'svelte/transition';
	import { flyFade } from '$lib/transitions.js';

	/**
	 * `title` always sets the dialog's accessible name; `showTitle` only
	 * controls whether it also renders as a visible heading. About wants the
	 * dialog labeled "About IndieNodes" for assistive tech without repeating
	 * it as on-screen text once its own centered logo/wordmark says the same
	 * thing visually.
	 *
	 * `dialogClass` is an escape hatch, not a general styling API: every
	 * caller so far wants the same 48rem text-dialog sizing except one (the
	 * join page's full-size template preview, which wants to fill most of
	 * the viewport instead) — a passthrough class lets that one caller
	 * override just the sizing in its own scoped stylesheet (via `:global`)
	 * rather than this component growing a size-variant prop for a need
	 * that has exactly one caller so far.
	 */
	let { open = false, title, showTitle = true, dialogClass = '', onClose, children } = $props();

	/** @type {HTMLElement | null} */
	let dialogEl = $state(null);

	function close() {
		onClose?.();
	}

	/** @param {KeyboardEvent} event */
	function handleKeydown(event) {
		if (event.key === 'Escape') close();
	}

	$effect(() => {
		if (!open) return;

		dialogEl?.focus();

		const originalOverflow = document.body.style.overflow;
		document.body.style.overflow = 'hidden';

		return () => {
			document.body.style.overflow = originalOverflow;
		};
	});
</script>

{#if open}
	<div
		class="backdrop"
		role="presentation"
		onclick={(event) => {
			if (event.target === event.currentTarget) close();
		}}
		transition:fade={{ duration: 160 }}
	>
		<div
			bind:this={dialogEl}
			class="dialog {dialogClass}"
			role="dialog"
			aria-modal="true"
			aria-label={title}
			tabindex="-1"
			onkeydown={handleKeydown}
			transition:flyFade={{ y: 28, duration: 240 }}
		>
			<div class="dialog-header" class:untitled={!showTitle}>
				{#if showTitle}
					<h2>{title}</h2>
				{/if}
				<button type="button" class="close-button" onclick={close} aria-label="Close">
					<svg
						viewBox="0 0 24 24"
						width="20"
						height="20"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						aria-hidden="true"
					>
						<path d="M6 6l12 12M18 6L6 18" stroke-linecap="round" />
					</svg>
				</button>
			</div>
			<div class="dialog-body">
				{@render children?.()}
			</div>
		</div>
	</div>
{/if}

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		/* Above every floating chrome control in `+layout.svelte`, including
		   the menu trigger at 102 — that one sits deliberately above the nav
		   drawer's own backdrop and panel, which put it above this one too
		   and left the hamburger and brand mark painted over a dialog that
		   is supposed to be covering them. A modal is modal. */
		z-index: 200;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 2.5rem;
		background: rgb(0 0 0 / 0.4);
	}

	.dialog {
		max-width: 48rem;
		width: 100%;
		max-height: 85vh;
		overflow-y: auto;
		padding: 2.5rem;
		border-radius: var(--radius-lg);
		/* Solid, not glass: modal content has to be read, and the backdrop
       behind it is already an opaque overlay, so there is nothing for a
       blur to reveal. Full contrast instead, per the same rule that keeps
       body text and form inputs off translucent surfaces elsewhere. */
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		box-shadow: 0 16px 48px rgb(0 0 0 / 0.3);
	}

	.dialog-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1.6rem;
		margin-bottom: 1.6rem;
	}

	/* With no title, the close button is the row's only child; space-between
	   would otherwise pull it to the start instead of leaving it top-right. */
	.dialog-header.untitled {
		justify-content: flex-end;
	}

	.dialog-header h2 {
		margin: 0;
	}

	.close-button {
		flex-shrink: 0;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 2rem;
		height: 2rem;
		border-radius: var(--radius-sm);
		border: 1px solid var(--border);
		background: transparent;
		color: var(--text-muted);
		cursor: pointer;
	}

	.close-button:hover {
		background: var(--glass-bg);
		color: var(--text);
	}

	@media (max-width: 40rem) {
		.backdrop {
			align-items: flex-end;
			padding: max(0.75rem, env(safe-area-inset-top)) 0.75rem
				max(0.75rem, env(safe-area-inset-bottom));
		}

		.dialog {
			--text-xs: 0.95rem;
			--text-sm: 1.15rem;
			--text-base: 1.4rem;
			--text-lg: 1.6rem;
			--text-xl: 1.8rem;
			--text-2xl: 2.2rem;
			max-height: calc(100dvh - 1.5rem);
			padding: 1.25rem;
			border-radius: 1.1rem;
			font-size: var(--text-base);
		}

		.dialog-header {
			gap: 1rem;
			margin-bottom: 1rem;
		}
	}
</style>
