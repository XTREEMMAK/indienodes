<script>
	/**
	 * How to get into the ring.
	 *
	 * This page used to document opening a pull request, behind a notice
	 * saying the real submission form was unbuilt. This is that form, and the
	 * cutover is deliberate and immediate: `open-questions.md` settled that
	 * the PR and issue paths are retired the moment the form ships rather than
	 * running alongside it, so there is one documented way in and nothing to
	 * keep in sync.
	 *
	 * The sidebar is a stepper, not a table of contents. The flow has a real
	 * sequence in it (a token has to be issued before it can be placed, and
	 * placed before it can be verified), so later steps stay visible and
	 * disabled rather than hidden: the shape of the whole thing is legible
	 * from the first screen, which is the part that makes a six-step form feel
	 * finite.
	 *
	 * The reference tables that used to be their own tabs are still here, as
	 * collapsed help beside the fields they explain. They were good reference
	 * and bad instructions; nobody reads a field table before filling in a
	 * form, but they do open one when a specific field confuses them.
	 */
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import GlassPanel from '../../components/GlassPanel.svelte';
	import FormField from '../../components/FormField.svelte';
	import StepProgress from '../../components/StepProgress.svelte';
	import Modal from '../../components/Modal.svelte';
	import EulaContent from '../../components/legal/EulaContent.svelte';
	import Honeypot from '../../components/Honeypot.svelte';
	import { SITE_ORIGIN } from '$lib/config.js';
	import { ringStore } from '$lib/ringStore.svelte.js';
	import { hasBackend, useMock } from '$lib/submissionApi.js';
	import { flyFade, outFade } from '$lib/transitions.js';
	import {
		submissionStore as form,
		STEPS,
		newTrack,
		newPage
	} from '$lib/submissionStore.svelte.js';
	import {
		ENTRY_TYPES,
		PRO_OPTIONS,
		MAX_TRACKS,
		WHY_MAX_LENGTH
	} from '$lib/submissionValidation.js';
	import { uniqueEntryId } from '$lib/slug.js';
	import { WIDGET_TIERS, badgeStylesFor, embedHtmlFor } from '$lib/widgetTiers.js';
	import { generatorDraftStore } from '$lib/generator/generatorDraftStore.svelte.js';
	import { TEMPLATES, findTemplate } from '$lib/generator/registry.js';
	import { buildGeneratorData } from '$lib/generator/data.js';
	import { exportSite } from '$lib/generator/zipExport.js';
	import { ACCEPTED_IMAGE_TYPES } from '$lib/generator/assets.js';
	import { uid } from '$lib/uid.js';
	import { socialIcon } from '$lib/generator/templates/shared.js';

	// Tag suggestions and the provisional id both need the ring; neither is
	// required for the form to work, so a failed load degrades to "no
	// suggestions" rather than blocking anything.
	onMount(() => ringStore.ensureLoaded());

	// The generator draft is a second, independent store (see
	// generatorDraftStore.svelte.js) because IndexedDB is the only place in
	// this app that can hold the actual Blobs a no-site creator uploads; it
	// has to be loaded explicitly, unlike submissionStore's own localStorage
	// draft which is ready synchronously on mount.
	onMount(() => {
		generatorDraftStore.load();
	});

	const entry = $derived(form.entry);
	const review = $derived(form.review);
	const generator = $derived(generatorDraftStore.generator);

	/** Same cap as ring.json's own `tracks`, reused rather than duplicated:
	    both exist for the same reason (a sampler, not a full catalog host). */
	const MAX_WORKS = MAX_TRACKS;

	/** Only a display default for the color picker itself (a native
	    `<input type="color">` always shows some color, it cannot be
	    genuinely empty) — `generator.accentColor` stays unset in the draft
	    until the creator actually touches the field, so an untouched picker
	    means no override is sent, not "override with this exact shade." */
	const DEFAULT_ACCENT_COLOR = '#6fae9c';

	const suggestedTags = $derived(
		[...new Set(ringStore.entries.flatMap((e) => e.tags ?? []))]
			.filter((t) => !entry.tags.includes(t))
			.sort()
			.slice(0, 14)
	);

	/** Labelled as provisional in the UI: the real one is assigned at approval. */
	const provisionalId = $derived(
		entry.creator && entry.type
			? uniqueEntryId(
					entry,
					ringStore.entries.map((e) => e.id)
				)
			: ''
	);

	/**
	 * The generator's own templates embed a real, working ring link in their
	 * footer by default (see `widgetEmbedHtml` in `templates/shared.js`) —
	 * the /join form used to only ever *tell* a creator to paste this
	 * themselves; a generated export can just do it. `provisionalId` is the
	 * best id available at generation time, same as the review step already
	 * shows it: not final until approval, but right in the common case, and
	 * a creator can always edit the embedded `site-id` by hand afterward the
	 * same way they could paste a corrected snippet in by hand today.
	 *
	 * Tier defaults to the full widget (`generator.widgetTier` starts unset),
	 * matching the behaviour this had before tiers existed at all, so a
	 * creator who never touches the new "Ring embed" field on the site step
	 * gets exactly what they always got.
	 */
	const generatorWidgetEmbed = $derived(
		embedHtmlFor({
			tier: generator.widgetTier ?? 'widget',
			badgeStyle: generator.badgeStyle ?? 'classic',
			origin: SITE_ORIGIN,
			siteId: provisionalId || undefined,
			entryType: entry.type
		})
	);

	/**
	 * The same embed, pointed at wherever this page itself is actually
	 * running rather than the real `SITE_ORIGIN` — used only by the live
	 * preview below, never by the real export. The exported zip has to use
	 * the real origin (it is uploaded to someone else's host and has to
	 * reach back to the live site for the script or the badge image), but
	 * the preview is an iframe on this same page, and pointing it at
	 * production instead of `page.url.origin` meant every preview tried to
	 * fetch `/embed.v1.js` or `/badges/*.svg` from `indienodes.us` — a real
	 * network request a local dev server has no reason to depend on, and one
	 * that renders nothing at all, with no visible error, if that domain
	 * hasn't caught up with a change yet or isn't reachable from wherever
	 * this is being worked on.
	 */
	const previewWidgetEmbed = $derived(
		embedHtmlFor({
			tier: generator.widgetTier ?? 'widget',
			badgeStyle: generator.badgeStyle ?? 'classic',
			origin: page.url.origin,
			siteId: provisionalId || undefined,
			entryType: entry.type
		})
	);

	/**
	 * The success screen's own tier picker, for a creator with an existing
	 * site (the `has_own_site !== 'no'` branch below): this choice only ever
	 * decides which snippet is shown to copy, so it lives as local view
	 * state rather than in `generatorDraftStore` (that store is scoped to
	 * the generator, which this creator never used).
	 */
	let successTier = $state(/** @type {'widget' | 'badge' | 'text-link'} */ ('widget'));
	let successBadgeStyle = $state('classic');
	const successSnippet = $derived(
		embedHtmlFor({
			tier: successTier,
			badgeStyle: successBadgeStyle,
			origin: SITE_ORIGIN,
			siteId: provisionalId || undefined,
			entryType: entry.type
		})
	);

	let tagDraft = $state('');

	function commitTag() {
		const value = tagDraft.trim().toLowerCase();
		if (value && !entry.tags.includes(value)) {
			entry.tags = [...entry.tags, value];
			form.touch();
		}
		tagDraft = '';
	}

	/** @param {KeyboardEvent} event */
	function onTagKeydown(event) {
		// Comma as well as Enter: people type tag lists with commas, and
		// swallowing that is friendlier than adding "a, b, c" as one tag.
		if (event.key === 'Enter' || event.key === ',') {
			event.preventDefault();
			commitTag();
		} else if (event.key === 'Backspace' && !tagDraft && entry.tags.length) {
			entry.tags = entry.tags.slice(0, -1);
		}
	}

	/**
	 * Named rather than inline `.filter((t) => t.uid !== uid)` at each call
	 * site, and typed via `@param` on the function itself rather than a cast
	 * inside the arrow's parameter list. A JSDoc type-cast written directly
	 * inside an arrow function's parens is mishandled by Svelte's compiler in
	 * `.svelte` files: it wraps the parameter in an extra layer of parens and
	 * produces invalid "parenthesized pattern" syntax once compiled. A
	 * `@param` above a named function's declaration is untouched by that
	 * transform and gives the same inference.
	 * @param {{ uid: string }} row
	 * @param {string} uid
	 */
	function isNotUid(row, uid) {
		return row.uid !== uid;
	}

	/** @param {string} uid */
	function removeTrack(uid) {
		entry.tracks = entry.tracks.filter((row) => isNotUid(row, uid));
	}

	/** @param {string} uid */
	function removePage(uid) {
		entry.pages = entry.pages.filter((row) => isNotUid(row, uid));
	}

	// Named, rather than inline `onclick={() => (entry.tracks = [...entry.tracks, newTrack()])}`,
	// specifically so the newly created row's own uid is available to hand to
	// justAddedUid below — an inline arrow discards that value the instant
	// the assignment finishes, with nothing left to scroll to afterward.
	function addTrack() {
		const track = newTrack();
		entry.tracks = [...entry.tracks, track];
		justAddedUid = track.uid;
	}

	function addPage() {
		const page = newPage();
		entry.pages = [...entry.pages, page];
		justAddedUid = page.uid;
	}

	/**
	 * The no-site branch's own repeatable rows, holding real uploaded files
	 * rather than URLs. `generatorDraftStore.save` is debounced for text
	 * fields (label/caption), same as everywhere else in this form, but a
	 * file selection calls `saveNow` instead: a chosen file is exactly the
	 * kind of change worth writing to IndexedDB immediately, since losing it
	 * to a closed tab a moment later would mean re-picking it.
	 *
	 * Every function below reads `generator.works`/`socialLinks` into an
	 * explicitly-typed local first, rather than calling `.map`/`.filter`
	 * directly on the loosely-typed store value: an inline `@type` cast on
	 * an arrow function's own parameter is what `isNotUid`'s doc comment
	 * above describes Svelte's compiler mishandling in `.svelte` files, and
	 * typing the array up front sidesteps needing one at all.
	 * @typedef {{ uid: string, label?: string, caption?: string, file: File | null }} WorkRow
	 * @typedef {{ uid: string, label: string, url: string }} SocialLinkRow
	 */

	function addWork() {
		const row = { uid: uid(), file: null };
		/** @type {WorkRow[]} */
		const works = [...(generator.works ?? []), row];
		generatorDraftStore.save({ generator: { works } });
		justAddedUid = row.uid;
	}

	/** @param {string} uid */
	function removeWork(uid) {
		/** @type {WorkRow[]} */
		const current = generator.works ?? [];
		generatorDraftStore.saveNow({ generator: { works: current.filter((w) => w.uid !== uid) } });
	}

	/**
	 * @param {string} uid
	 * @param {Record<string, any>} patch
	 */
	function updateWorkText(uid, patch) {
		/** @type {WorkRow[]} */
		const current = generator.works ?? [];
		const works = current.map((w) => (w.uid === uid ? { ...w, ...patch } : w));
		generatorDraftStore.save({ generator: { works } });
	}

	/**
	 * @param {string} uid
	 * @param {Event} event
	 */
	function updateWorkFile(uid, event) {
		const file = /** @type {HTMLInputElement} */ (event.currentTarget).files?.[0] ?? null;
		/** @type {WorkRow[]} */
		const current = generator.works ?? [];
		const works = current.map((w) => (w.uid === uid ? { ...w, file } : w));
		generatorDraftStore.saveNow({ generator: { works } });
	}

	/** @param {Event} event */
	function updateIcon(event) {
		const file = /** @type {HTMLInputElement} */ (event.currentTarget).files?.[0] ?? null;
		generatorDraftStore.saveNow({ generator: { icon: file } });
	}

	function addSocialLink() {
		const row = { uid: uid(), label: '', url: '' };
		/** @type {SocialLinkRow[]} */
		const socialLinks = [...(generator.socialLinks ?? []), row];
		generatorDraftStore.save({ generator: { socialLinks } });
		justAddedUid = row.uid;
	}

	/** @param {string} uid */
	function removeSocialLink(uid) {
		/** @type {SocialLinkRow[]} */
		const current = generator.socialLinks ?? [];
		generatorDraftStore.save({ generator: { socialLinks: current.filter((s) => s.uid !== uid) } });
	}

	/**
	 * @param {string} uid
	 * @param {Record<string, any>} patch
	 */
	function updateSocialLink(uid, patch) {
		/** @type {SocialLinkRow[]} */
		const current = generator.socialLinks ?? [];
		const socialLinks = current.map((s) => (s.uid === uid ? { ...s, ...patch } : s));
		generatorDraftStore.save({ generator: { socialLinks } });
	}

	/**
	 * A step change no longer moves the viewport: the panel is a fixed-height
	 * box now (see `.join-page`'s CSS), not something that can scroll into
	 * view. Focus takes over the job scrollIntoView used to do: it moves
	 * attention (and, for a screen reader, the reading position) to the new
	 * step's own heading. See `focusHeading` below for how.
	 * @param {string} id
	 */
	function goTo(id) {
		form.step = id;
	}

	/**
	 * A Svelte action, not a `$effect` reading `document.querySelector`, and
	 * that distinction matters here specifically. `{#key form.step}` keeps
	 * both the outgoing and incoming `.step-body` mounted for the length of
	 * their crossfade (see `outFade`'s doc comment in `$lib/transitions.js`),
	 * so for that whole window there are genuinely two `.step-body h2`
	 * elements in the DOM at once. A selector-based effect has no way to
	 * know which is which and can easily grab the outgoing one; when that
	 * node is then removed at the end of its exit transition, focus silently
	 * falls back to `<body>` rather than landing anywhere useful, since
	 * nothing was watching for that.
	 *
	 * An action sidesteps the ambiguity by construction: it runs once, tied
	 * to the one specific node Svelte just created for THIS mount, so
	 * "which one" is never a question that needs answering.
	 * @param {HTMLElement} node
	 */
	function focusHeading(node) {
		node.focus();
	}

	/**
	 * A row an "Add a track" / "Add a page" / "Add a link" button just
	 * created. Every one of those buttons appends to an array that already
	 * has rows above it, inside `.step-body`'s own scroll region (see
	 * `.join-page`'s CSS): a new row lands wherever flow puts it, which on a
	 * step with a few existing rows is routinely below the fold. Nothing
	 * about clicking a plain `<button>` scrolls anything into view on its
	 * own — that is a Playwright convenience during automated testing, not
	 * real browser behavior — so without this, "Add" reads as doing nothing
	 * at all: a row was created, but the only feedback of that is invisible
	 * until the visitor scrolls down looking for it.
	 */
	let justAddedUid = $state('');

	/**
	 * Paired with `justAddedUid` above. An action, not an `$effect` keyed on
	 * `justAddedUid`, for the same reason `focusHeading` is: this needs to
	 * act on the one specific row just created, not re-run and potentially
	 * mis-target whichever row happens to match some selector at the moment
	 * it fires.
	 * @param {HTMLElement} node
	 * @param {string} uid
	 */
	function scrollNewRowIntoView(node, uid) {
		if (uid !== justAddedUid) return;
		justAddedUid = '';
		// Focus first, with preventScroll: calling node.scrollIntoView()
		// and then focusing a descendant queues two competing scroll
		// intents on the same container in the same tick — the browser's
		// own implicit "scroll the newly focused element into view"
		// (triggered by .focus() below) cancels the explicit smooth
		// scrollIntoView before its animation ever starts, leaving
		// .step-body's scrollTop at 0 despite the row being clipped below
		// it. Only one of the two gets to actually run; this keeps it to
		// exactly one by disabling focus's own competing scroll.
		/** @type {HTMLElement | null} */
		const target = node.querySelector('input, textarea, select');
		target?.focus({ preventScroll: true });
		node.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
	}

	/**
	 * The `site` step only applies to a no-site entry; filtering it out of
	 * both the sidebar's own list and next/back's step-to-step walk here is
	 * what keeps the two in agreement automatically, rather than the
	 * sidebar's numbering and the actual navigation order being two
	 * separately-maintained ideas of "which steps exist right now."
	 */
	const visibleSteps = $derived(STEPS.filter((s) => !s.applicable || s.applicable(entry)));

	const stepIndex = $derived(visibleSteps.findIndex((s) => s.id === form.step));

	function next() {
		const target = visibleSteps[stepIndex + 1];
		if (target) goTo(target.id);
	}

	function back() {
		const target = visibleSteps[stepIndex - 1];
		if (target) goTo(target.id);
	}

	/**
	 * Whether `visibleSteps[index]` is a step the submitter could actually
	 * have reached by clicking Continue that many times in a row from the
	 * start — every step strictly before it is complete. Reused for two
	 * things: gating the progress bar's own click-to-jump (`goToIndex`
	 * below), and building the `reachable` array the bar renders locked
	 * steps from, so what's clickable and what merely looks clickable never
	 * disagree.
	 * @param {number} index
	 */
	function stepReachable(index) {
		for (let i = 0; i < index; i++) {
			if (!form.isStepComplete(visibleSteps[i].id)) return false;
		}
		return true;
	}

	const reachableSteps = $derived(visibleSteps.map((_, i) => stepReachable(i)));

	/**
	 * The progress bar's own click handler. Going backward to an
	 * already-visited step is always allowed (nothing about revisiting
	 * filled-in fields needs gating); going forward is capped at
	 * `stepReachable`, the same bar Continue itself enforces one step at a
	 * time — so jumping via the bar can reach anywhere Continue could have
	 * gotten you, and nowhere Continue couldn't have.
	 * @param {number} index
	 */
	function goToIndex(index) {
		const target = visibleSteps[index];
		if (!target) return;
		if (index > stepIndex && !stepReachable(index)) return;
		goTo(target.id);
	}

	/** Whether the current step's own fields are satisfied. */
	const canAdvance = $derived(form.isStepComplete(form.step));

	const mediaHeading = $derived(
		/** @type {Record<string, string>} */ ({
			audio: 'Your tracks',
			comic: 'Your pages',
			text: 'Your excerpt',
			game: 'Your screenshots'
		})[entry.type] ?? 'The work itself'
	);

	/** Human text for a verification that ran and came back negative. */
	const verifyMessage = $derived(
		{
			token_not_found:
				'We reached the page, but the token was not on it yet. If you just added it, give your host a moment to publish and try again.',
			unreachable: 'We could not load that page at all. Check it is public and not behind a login.',
			not_https: 'That URL has to be served over https.'
		}[form.verifyFailure] ?? ''
	);

	// ---------------------------------------------------------- the `site` step, generator UI --

	const templateOptions = $derived(
		TEMPLATES[/** @type {keyof typeof TEMPLATES} */ (entry.type)] ?? []
	);

	/** Falls back to the first available template for the type, so a preview always has one selected. */
	const selectedTemplateId = $derived(generator.templateId || templateOptions[0]?.id || '');

	/** @param {string} id */
	function selectTemplate(id) {
		generatorDraftStore.save({ generator: { templateId: id } });
	}

	/**
	 * Resolves a stored `Blob` to a `blob:` URL for the live preview only —
	 * the real export resolves the same `Blob`s to relative zip paths
	 * instead (see `zipExport.js`). Not cached or explicitly revoked: this
	 * page's own lifetime is short, object URLs are cheap references rather
	 * than copies, and the browser releases them at latest on navigation.
	 * @param {Blob | null | undefined} file
	 */
	function previewUrl(file) {
		return file ? URL.createObjectURL(file) : null;
	}

	/** The exact `{html,css,js}` the chosen template produces for the current draft, live. */
	const previewDoc = $derived.by(() => {
		const template = findTemplate(entry.type, selectedTemplateId);
		if (!template) return null;
		const data = buildGeneratorData(
			entry,
			{
				...generator,
				verificationToken: form.token || 'preview-token',
				widgetEmbed: previewWidgetEmbed
			},
			previewUrl
		);
		return template.render(data);
	});

	// A literal opening or closing tag for this HTML element cannot appear
	// anywhere in this file's script block, including inside an ordinary
	// string argument or even a "//" comment: both Svelte's own compiler and
	// a browser's HTML parser scan for that exact substring to find where a
	// tag starts or ends, without knowing or caring that it is sitting
	// inside quotes. The tag name is assembled from separate character
	// pieces below for exactly that reason, everywhere it is needed.
	const TAG = 's' + 'cript';
	const SCRIPT_OPEN_TAG = `<${TAG}>`;
	const SCRIPT_CLOSE_TAG = `<${'/' + TAG}>`;
	const SCRIPT_SRC_TAG = `<${TAG} src="script.js">${SCRIPT_CLOSE_TAG}`;

	/** Inlines {html, css, js} into one document, the same way the template review used for this project was built. */
	const previewSrcdoc = $derived(
		previewDoc
			? previewDoc.html
					.replace(
						'<link rel="stylesheet" href="styles.css" />',
						`<style>${previewDoc.css}</style>`
					)
					.replace(
						SCRIPT_SRC_TAG,
						previewDoc.js ? `${SCRIPT_OPEN_TAG}${previewDoc.js}${SCRIPT_CLOSE_TAG}` : ''
					)
			: ''
	);

	let exporting = $state(false);
	/** @type {string} */
	let exportMessage = $state('');
	let exportNeedsReload = $state(false);
	let previewModalOpen = $state(false);
	/**
	 * The inline preview is an iframe: hovering it while scrolling the page
	 * hands the wheel event to the iframe's own document instead of
	 * `.step-body`, with no visual cue that happened — a visitor can be
	 * left scrolled inside the preview, unable to see Back/Download/
	 * Continue below it, with no obvious reason why the page "stopped
	 * scrolling." An overlay button sitting on top of the iframe until
	 * clicked keeps every wheel/pointer event on the outer page (a plain
	 * element, not a nested browsing context, so it never captures scroll
	 * the way the iframe underneath it would) until the visitor explicitly
	 * opts in to interacting with what's inside it.
	 */
	let previewScrollActive = $state(false);
	let eulaModalOpen = $state(false);

	async function onExportSite() {
		if (exporting) return;
		exporting = true;
		exportMessage = '';
		exportNeedsReload = false;
		try {
			// The token has to exist and be embedded in the export before the
			// creator ever uploads it anywhere (submission-form-spec.md
			// section 4's sequence) — generate one now if this is the first
			// export attempt, rather than requiring a separate "get my token"
			// step the no-site branch has no other use for.
			if (!form.token) await form.requestToken();
			if (form.error) throw form.error;

			const result = await exportSite(entry, {
				...generator,
				verificationToken: form.token,
				widgetEmbed: generatorWidgetEmbed,
				provisionalId
			});
			form.recordExport(result.assetPaths);

			const url = URL.createObjectURL(result.zip);
			const link = document.createElement('a');
			link.href = url;
			link.download = result.filename;
			link.click();
			URL.revokeObjectURL(url);
			exportMessage =
				'Downloaded. Upload the contents of the zip to your chosen host, then continue.';
		} catch (e) {
			// A dynamically-imported module (jszip, loaded only on this page —
			// see zipExport.js's own doc comment for why) failing to fetch is
			// almost always a stale dev-server module-cache, not a real
			// problem with the export itself: worth naming plainly rather than
			// surfacing whatever raw wording the browser used for it.
			const message = e instanceof Error ? e.message : '';
			exportNeedsReload = /dynamically imported module|Outdated Optimize Dep/i.test(message);
			exportMessage = exportNeedsReload
				? 'Could not load the export tool. This is a one-time dev hiccup — reloading picks up correctly, and nothing you have filled in is lost.'
				: message || 'Could not build the export.';
		} finally {
			exporting = false;
		}
	}

	// -------------------------------------------------- `verify` step, no-site branch only --

	let sourceUrlDraft = $state('');

	async function onBindSourceUrl() {
		if (!sourceUrlDraft.trim()) return;
		await form.bindSourceUrl(sourceUrlDraft.trim());
		if (!form.error) await form.runVerify();
	}

	const HOSTING = [
		{
			host: 'archive.org',
			plays: 'Yes',
			level: 'yes',
			why: 'Free, permanent, built for this, and sends the cross-origin header. The standing recommendation.'
		},
		{
			host: 'Your own site',
			plays: 'Yes',
			level: 'yes',
			why: 'As long as the file is served with an Access-Control-Allow-Origin header.'
		},
		{
			host: 'Bandcamp',
			plays: 'No',
			level: 'no',
			why: 'Its direct audio URLs expire within about a day. The embedded player never expires, but cannot tell this site when a track ends, so it cannot take part in a queue.'
		},
		{
			host: 'YouTube',
			plays: 'No',
			level: 'no',
			why: 'Its terms prohibit playing a video’s audio on its own, and its embed brings ads and tracking this project does not put on your visitors.'
		},
		{
			host: 'Spotify, Apple Music, SoundCloud',
			plays: 'No',
			level: 'no',
			why: 'Platform players cannot hand a file to this site. Link out with source_url instead.'
		}
	];
</script>

<svelte:head>
	<title>Join the ring, IndieNodes</title>
</svelte:head>

<div class="join-page">
	<h1 class="page-title">Join the ring</h1>

	{#if !hasBackend && !useMock}
		<!-- A production build with no webhook configured. Saying so is the
		     whole point: a form that accepts input and drops it is worse than
		     no form, and this is the one state where that could happen. -->
		<div class="interim-note">
			<p>
				<strong>Submissions are closed right now.</strong> The form below is not accepting entries while
				the submission service is unavailable. Nothing you type here will be sent. Please check back.
			</p>
		</div>
	{:else if useMock}
		<div class="interim-note">
			<p>
				<strong>Development mode.</strong> No submission backend is configured, so this form is
				running against canned responses and nothing is sent anywhere. Add
				<code>?mock=fail-verify</code>, <code>network</code>, <code>rate-limited</code>, or
				<code>slow</code> to the URL to exercise the failure states.
			</p>
		</div>
	{/if}

	{#if form.reference}
		<!-- Success is its own screen rather than a seventh step: the stepper
		     is for work still to do, and there is none left. -->
		<GlassPanel class="done-panel">
			<h2>That is in.</h2>
			<p>
				A person reviews every submission before it appears; we will email you either way. Nothing
				about your entry is public until then.
			</p>
			<p class="reference-block">
				<span class="reference-label">Your reference</span>
				<code class="reference-code">{form.reference}</code>
			</p>
			{#if entry.has_own_site === 'no'}
				{@const chosenTier =
					WIDGET_TIERS.find((t) => t.id === (generator.widgetTier ?? 'widget'))?.label ??
					'Full widget'}
				<h3>One last thing: the ring embed</h3>
				<p>
					Your {chosenTier.toLowerCase()} is already in your generated page's footer, site-id and all
					— nothing left to paste. It will link to your actual neighbours once your entry is live.
				</p>
				<p class="note">
					{#if (generator.widgetTier ?? 'widget') === 'widget'}
						It is a self-contained custom element in its own shadow root: it cannot restyle your
						page and your stylesheet cannot restyle it.
					{:else}
						It is a plain link{(generator.widgetTier ?? 'widget') === 'badge'
							? ' and a small image'
							: ''}, nothing more.
					{/if}
					No tracking, no cookies, no analytics.
					<a href={resolve('/widget')}>See the full widget running</a>.
				</p>
			{:else}
				<h3>One last thing: the ring embed</h3>
				<p>
					Pick what you'd like to paste onto your site. All three link back to the ring the same
					way; this only changes how much room it takes.
				</p>
				<div class="option-row">
					{#each WIDGET_TIERS as tier (tier.id)}
						<label class="option">
							<input
								type="radio"
								name="success_widget_tier"
								value={tier.id}
								checked={successTier === tier.id}
								onchange={() => (successTier = tier.id)}
							/>
							<span class="option-label">{tier.label}</span>
						</label>
					{/each}
				</div>
				{#if successTier === 'badge'}
					<div class="option-row">
						{#each badgeStylesFor(entry.type) as style (style.id)}
							<label class="option">
								<input
									type="radio"
									name="success_badge_style"
									value={style.id}
									checked={successBadgeStyle === style.id}
									onchange={() => (successBadgeStyle = style.id)}
								/>
								<span class="option-label">{style.label}</span>
							</label>
						{/each}
					</div>
				{/if}
				<p>
					Paste this wherever you would like it on your site. It will link to your actual neighbours
					once your entry is live.
				</p>
				<pre><code>{successSnippet}</code></pre>
				<p class="note">
					{#if successTier === 'widget'}
						It is a self-contained custom element in its own shadow root: it cannot restyle your
						page and your stylesheet cannot restyle it.
					{:else}
						It is a plain link{successTier === 'badge' ? ' and a small image' : ''}, nothing more.
					{/if}
					No tracking, no cookies, no analytics.
					<a href={resolve('/widget')}>See the full widget running</a>.
				</p>
			{/if}
			<button
				type="button"
				class="btn btn-primary submit-again-button"
				onclick={() => form.reset()}
			>
				Submit another entry
			</button>
		</GlassPanel>
	{:else}
		<div class="join-layout">
			<!-- Horizontal, not the vertical sidebar this used to be: same
			     particle-progress mechanic as lbhq's own request form
			     (src/lib/components/StepProgress.svelte there), ported into
			     this project's own component with this app's own palette.
			     Click-to-jump, same as the original sidebar was, but gated
			     by stepReachable: a step ahead of what Continue would have
			     let through stays visible (the whole point of the bar is
			     showing the shape of what's left) but not an actual target,
			     so jumping via the bar can reach anywhere Continue could
			     have gotten you, and nowhere it couldn't. -->
			<StepProgress
				step={stepIndex}
				total={visibleSteps.length}
				labels={visibleSteps.map((s) => s.label)}
				reachable={reachableSteps}
				onStepClick={goToIndex}
			/>

			<div class="panel" id="join-panel">
				<!-- The step-switch itself, keyed on form.step, crossfades
				     rather than jump-cutting: same in/out pair and parameter
				     shape as the route transition in +layout.svelte and
				     FieldNode's card crossfade, so this reads as the same
				     motion language as the rest of the app rather than a
				     one-off. `.step-body` gets its own overflow-y: this is the
				     one mechanism that makes "steps shouldn't need to scroll"
				     and "consent is the deliberate exception" the same rule:
				     short steps never show a scrollbar, consent's legal text
				     is simply the one case expected to need it. -->
				{#key form.step}
					<div
						class="step-body"
						in:flyFade={{ x: 20, duration: 280, delay: 90 }}
						out:outFade={{ duration: 180 }}
					>
						{#if form.step === 'prep'}
							<h2 tabindex="-1" use:focusHeading>Before you start</h2>
							<p>
								This takes about five minutes. Nothing is saved on a server until you press submit
								at the end, and your progress is kept in this browser if you need to step away.
							</p>
							<ul class="checklist">
								<li>
									<svg
										class="checklist-icon"
										viewBox="0 0 24 24"
										width="22"
										height="22"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										aria-hidden="true"
									>
										<rect x="3" y="4" width="18" height="16" rx="2" />
										<path d="M3 9h18" stroke-linecap="round" />
									</svg>
									<span>
										<strong>A page you control.</strong> Your site, your Bandcamp, your itch.io profile:
										anywhere you can edit the page or its description.
									</span>
								</li>
								<li>
									<svg
										class="checklist-icon"
										viewBox="0 0 24 24"
										width="22"
										height="22"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										aria-hidden="true"
									>
										<rect x="3" y="4" width="18" height="16" rx="2" />
										<circle cx="9" cy="10" r="1.5" />
										<path
											d="M21 16l-5.5-5.5a2 2 0 0 0-2.8 0L4 19"
											stroke-linecap="round"
											stroke-linejoin="round"
										/>
									</svg>
									<span>
										<strong>Somewhere your media already lives — or we'll build you a page.</strong> If
										you already have a site, you'll paste links to files you host. If not, say so on the
										next step, and you'll upload the actual files there instead.
									</span>
								</li>
								<li>
									<svg
										class="checklist-icon"
										viewBox="0 0 24 24"
										width="22"
										height="22"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										aria-hidden="true"
									>
										<rect x="3" y="5" width="18" height="14" rx="2" />
										<path d="M3 7l9 6 9-6" stroke-linecap="round" stroke-linejoin="round" />
									</svg>
									<span>
										<strong>An email address.</strong> Used once, to tell you what happened to this submission,
										then deleted. It is not an account and not a mailing list.
									</span>
								</li>
							</ul>

							<div class="note-panel rules-panel">
								<h3>Content rules</h3>
								<ul class="rules-list">
									<li>You must be the creator of your content and owner of your website.</li>
									<li>
										This discovery network features indies in the Music, Comics, Manga, Video Games,
										and Writing space. We may expand to other indie creators in future.
									</li>
									<li>
										While we will accept NSFW content, such content must be clearly labeled on your
										application.
									</li>
									<li>
										No bigots allowed! Your website must not host anything discriminatory, including
										but not limited to: sexism, homophobia, transphobia + TERF ideology, xenophobia,
										ableism, or any other hatred towards minorities.
									</li>
									<li>
										While we do allow works made using
										AI-assisted tools such as Claude Code, content made purely through 
										generative techniques that produce music, art, video, or games
										will not be accepted.
									</li>
									<li>
										While we will do our best to keep the webring functional, please make sure to
										maintain your website and links. If you need a change, please
										<a href={resolve('/update')}>submit a change request</a>. Not doing so risks
										your site being removed from the network.
									</li>
									<li>We reserve the right to remove sites at our discretion.</li>
								</ul>
							</div>

							<div class="actions">
								<button type="button" class="btn btn-primary" onclick={next}>Start</button>
							</div>
						{:else if form.step === 'ownership'}
							<h2 tabindex="-1" use:focusHeading>Do you have a site?</h2>
							<p>
								This changes a few of the steps ahead, so we ask before anything else: who you are,
								what you made, all of that comes next.
							</p>

							<FormField
								id="f-has-site"
								label="Do you already have a site you control?"
								hint="Your own domain, or a page on something like Neocities. If not, we can build you a small one to upload."
								required
								error={form.entryErrors.has_own_site}
							>
								{#snippet children(describedBy)}
									<div class="option-row" aria-describedby={describedBy}>
										<label class="option">
											<input
												type="radio"
												name="has_own_site"
												value="yes"
												checked={entry.has_own_site === 'yes'}
												onchange={() => {
													entry.has_own_site = 'yes';
													form.touch();
												}}
											/>
											<span class="option-label">Yes, I have a site</span>
										</label>
										<label class="option">
											<input
												type="radio"
												name="has_own_site"
												value="no"
												checked={entry.has_own_site === 'no'}
												onchange={() => {
													entry.has_own_site = 'no';
													form.touch();
												}}
											/>
											<span class="option-label">No, build me one</span>
										</label>
									</div>
								{/snippet}
							</FormField>

							{#if entry.has_own_site === 'no'}
								<div class="note-panel" in:flyFade={{ y: 8, duration: 220 }}>
									<p class="note">
										No problem: after the next couple of steps we will build you a small page with
										your work on it. You will upload it somewhere yourself, and link it here once it
										is live.
									</p>
								</div>
							{/if}

							<div class="actions">
								<button type="button" class="btn btn-ghost" onclick={back}>Back</button>
								<button type="button" class="btn btn-primary" disabled={!canAdvance} onclick={next}>
									Continue
								</button>
							</div>
						{:else if form.step === 'entry'}
							<h2 tabindex="-1" use:focusHeading>Your entry</h2>
							<p>This is what people see on your card in the ring.</p>

							<FormField
								id="f-creator"
								label="Your name or studio"
								required
								error={form.entryErrors.creator}
							>
								{#snippet children(describedBy)}
									<input
										id="f-creator"
										class="control"
										type="text"
										autocomplete="off"
										bind:value={entry.creator}
										oninput={() => form.touch()}
										aria-describedby={describedBy}
										aria-invalid={Boolean(form.entryErrors.creator)}
									/>
								{/snippet}
							</FormField>

							<FormField
								id="f-type"
								label="What kind of work is this?"
								required
								error={form.entryErrors.type}
							>
								{#snippet children(describedBy)}
									<select
										id="f-type"
										class="control"
										bind:value={entry.type}
										onchange={() => form.touch()}
										aria-describedby={describedBy}
										aria-invalid={Boolean(form.entryErrors.type)}
									>
										<option value="" disabled>Choose one</option>
										{#each ENTRY_TYPES as type (type)}
											<option value={type}>{type}</option>
										{/each}
									</select>
								{/snippet}
							</FormField>

							<FormField
								id="f-why"
								label="Why is this worth someone's time?"
								hint="One line, in your own voice. A node here is you, not one release — this is your introduction and your pitch combined, so it does more work than anything else on the card."
								required
								error={form.entryErrors.why}
							>
								{#snippet children(describedBy)}
									<input
										id="f-why"
										class="control"
										type="text"
										maxlength={WHY_MAX_LENGTH + 20}
										bind:value={entry.why}
										oninput={() => form.touch()}
										aria-describedby={describedBy}
										aria-invalid={Boolean(form.entryErrors.why)}
									/>
								{/snippet}
							</FormField>
							<p class="counter" class:over={entry.why.length > WHY_MAX_LENGTH}>
								{entry.why.length} / {WHY_MAX_LENGTH}
							</p>

							{#if entry.has_own_site === 'yes'}
								<FormField
									id="f-source"
									label="Where does this live?"
									hint="The page you want visitors sent to, and the page you will prove you control in a moment."
									required
									error={form.entryErrors.source_url}
								>
									{#snippet children(describedBy)}
										<input
											id="f-source"
											class="control"
											type="url"
											inputmode="url"
											placeholder="https://"
											bind:value={entry.source_url}
											oninput={() => form.touch()}
											aria-describedby={describedBy}
											aria-invalid={Boolean(form.entryErrors.source_url)}
										/>
									{/snippet}
								</FormField>
							{/if}

							<FormField
								id="f-tags"
								label="Tags"
								hint="At least one. Genre, medium, mood, whatever fits. Enter or comma to add."
								required
								error={form.entryErrors.tags}
							>
								{#snippet children(describedBy)}
									<input
										id="f-tags"
										class="control"
										type="text"
										autocomplete="off"
										bind:value={tagDraft}
										onkeydown={onTagKeydown}
										onblur={commitTag}
										aria-describedby={describedBy}
										aria-invalid={Boolean(form.entryErrors.tags)}
									/>
								{/snippet}
							</FormField>

							{#if entry.tags.length}
								<ul class="tag-list">
									{#each entry.tags as tag (tag)}
										<li>
											<button
												type="button"
												class="chip checked"
												onclick={() => form.toggleTag(tag)}
											>
												{tag}
												<span aria-hidden="true">×</span>
												<span class="sr-only">Remove tag</span>
											</button>
										</li>
									{/each}
								</ul>
							{/if}

							{#if suggestedTags.length}
								<p class="hint-inline">Already used in the ring:</p>
								<ul class="tag-list">
									{#each suggestedTags as tag (tag)}
										<li>
											<button type="button" class="chip" onclick={() => form.toggleTag(tag)}>
												{tag}
											</button>
										</li>
									{/each}
								</ul>
							{/if}

							<div class="explicit-panel">
								<label class="option">
									<input
										type="checkbox"
										bind:checked={entry.explicit}
										onchange={() => form.touch()}
									/>
									<span>
										<span class="option-label"
											>This entry is exclusively explicit / NSFW content</span
										>
										<span class="option-description">
											Not "contains some mature moments" — this is for a creator whose work here is
											adult content through and through. Checking it hides this entry from the
											field, Members, and Lists until a visitor explicitly turns explicit content on
											for themselves.
										</span>
									</span>
								</label>

								<div class="explicit-examples">
									<div>
										<p class="explicit-examples-title">Check this for</p>
										<ul>
											<li>Explicit sexual content or nudity</li>
											<li>Graphic violence, gore, or fetish content</li>
											<li>Substance use depicted explicitly as a central theme</li>
											<li>Explicit language throughout, not occasional</li>
										</ul>
									</div>
									<div>
										<p class="explicit-examples-title">Leave unchecked for</p>
										<ul>
											<li>Occasional strong language</li>
											<li>Suggestive humor or romance without explicit depiction</li>
											<li>Violence typical of an M-rated game or a thriller novel</li>
											<li>Dark or mature themes handled without graphic depiction</li>
										</ul>
									</div>
								</div>
							</div>

							{#if entry.type === 'audio'}
								<details class="help">
									<summary>Musicians: what makes a track actually playable here</summary>
									<p>
										A track plays here only when its link points at a direct audio file at a host
										that allows cross-origin requests. That is what lets it join the queue, hand
										over to the next track when it ends, and drive the animated background.
									</p>
									<div class="table-scroll">
										<table>
											<thead>
												<tr>
													<th scope="col">Where your audio lives</th>
													<th scope="col">Plays here</th>
													<th scope="col">Why</th>
												</tr>
											</thead>
											<tbody>
												{#each HOSTING as row (row.host)}
													<tr>
														<th scope="row">{row.host}</th>
														<td><span class="req" data-req={row.level}>{row.plays}</span></td>
														<td>{row.why}</td>
													</tr>
												{/each}
											</tbody>
										</table>
									</div>
									<p class="note">
										<strong>No file to link? Join anyway.</strong> Skip the tracks step entirely. Your
										entry still appears with your cover art and still sends people to you. It simply will
										not play here, and that is a perfectly normal kind of member to be.
									</p>
								</details>
							{/if}

							<div class="actions">
								<button type="button" class="btn btn-ghost" onclick={back}>Back</button>
								<button type="button" class="btn btn-primary" disabled={!canAdvance} onclick={next}>
									Continue
								</button>
							</div>
						{:else if form.step === 'media'}
							<h2 tabindex="-1" use:focusHeading>{mediaHeading}</h2>

							{#if !entry.type}
								<p class="note">Pick a type on the previous step first.</p>
							{:else if entry.has_own_site === 'no' && entry.type === 'audio'}
								<p>
									Up to {MAX_WORKS} tracks. Upload the actual files: they will be embedded in the page
									we build for you in a moment.
								</p>
								{#each generator.works ?? [] as work, i (work.uid)}
									<div class="repeat-row" use:scrollNewRowIntoView={work.uid}>
										<FormField id="f-work-label-{work.uid}" label="Track {i + 1} name">
											{#snippet children(describedBy)}
												<input
													id="f-work-label-{work.uid}"
													class="control"
													type="text"
													value={work.label ?? ''}
													oninput={(e) =>
														updateWorkText(work.uid, {
															label: /** @type {HTMLInputElement} */ (e.currentTarget).value
														})}
													aria-describedby={describedBy}
												/>
											{/snippet}
										</FormField>
										<FormField
											id="f-work-file-{work.uid}"
											label="Audio file"
											hint={work.file ? work.file.name : 'MP3, WAV, or similar.'}
										>
											{#snippet children(describedBy)}
												<input
													id="f-work-file-{work.uid}"
													class="control"
													type="file"
													accept="audio/*"
													onchange={(e) => updateWorkFile(work.uid, e)}
													aria-describedby={describedBy}
												/>
											{/snippet}
										</FormField>
										<button type="button" class="clear-button" onclick={() => removeWork(work.uid)}>
											Remove track {i + 1}
										</button>
									</div>
								{/each}
								{#if (generator.works?.length ?? 0) < MAX_WORKS}
									<button type="button" class="btn btn-ghost" onclick={addWork}>Add a track</button>
								{:else}
									<p class="note">That is the cap of {MAX_WORKS}.</p>
								{/if}
								<p class="note">
									<strong>No files yet? Skip this.</strong> Your generated page will still list you with
									a cover image if you add one on the next step.
								</p>
							{:else if entry.has_own_site === 'no' && entry.type === 'comic'}
								<p>Up to {MAX_WORKS} pages. Upload the actual page images.</p>
								{#each generator.works ?? [] as work, i (work.uid)}
									<div class="repeat-row" use:scrollNewRowIntoView={work.uid}>
										<FormField
											id="f-work-file-{work.uid}"
											label="Page {i + 1} image"
											required
											hint={work.file ? work.file.name : undefined}
										>
											{#snippet children(describedBy)}
												<input
													id="f-work-file-{work.uid}"
													class="control"
													type="file"
													accept={ACCEPTED_IMAGE_TYPES.join(',')}
													onchange={(e) => updateWorkFile(work.uid, e)}
													aria-describedby={describedBy}
												/>
											{/snippet}
										</FormField>
										<FormField id="f-work-caption-{work.uid}" label="Caption (optional)">
											{#snippet children(describedBy)}
												<input
													id="f-work-caption-{work.uid}"
													class="control"
													type="text"
													value={work.caption ?? ''}
													oninput={(e) =>
														updateWorkText(work.uid, {
															caption: /** @type {HTMLInputElement} */ (e.currentTarget).value
														})}
													aria-describedby={describedBy}
												/>
											{/snippet}
										</FormField>
										<button type="button" class="clear-button" onclick={() => removeWork(work.uid)}>
											Remove page {i + 1}
										</button>
									</div>
								{/each}
								{#if (generator.works?.length ?? 0) < MAX_WORKS}
									<button type="button" class="btn btn-ghost" onclick={addWork}>Add a page</button>
								{:else}
									<p class="note">That is the cap of {MAX_WORKS}.</p>
								{/if}
							{:else if entry.has_own_site === 'no' && entry.type === 'game'}
								<p>One screenshot or cover image, required so your page has something to show.</p>
								{#if generator.works?.[0]}
									<div use:scrollNewRowIntoView={generator.works[0].uid}>
										<FormField
											id="f-work-file-{generator.works[0].uid}"
											label="Screenshot"
											required
											hint={generator.works[0].file
												? generator.works[0].file.name
												: 'Any size works; wide screenshots read best.'}
										>
											{#snippet children(describedBy)}
												<input
													id="f-work-file-{generator.works[0].uid}"
													class="control"
													type="file"
													accept={ACCEPTED_IMAGE_TYPES.join(',')}
													onchange={(e) => updateWorkFile(generator.works[0].uid, e)}
													aria-describedby={describedBy}
												/>
											{/snippet}
										</FormField>
									</div>
								{:else}
									<button type="button" class="btn btn-ghost" onclick={addWork}>
										Add a screenshot
									</button>
								{/if}
							{:else if entry.type === 'audio'}
								<p>
									Up to {MAX_TRACKS}, so the ring stays a sampler rather than a catalog. Each link
									must point at a direct audio file you host.
								</p>
								{#each entry.tracks as track, i (track.uid)}
									<div class="repeat-row" use:scrollNewRowIntoView={track.uid}>
										<FormField
											id="f-track-label-{track.uid}"
											label="Track {i + 1} name"
											error={form.entryErrors[`tracks.${i}.label`]}
										>
											{#snippet children(describedBy)}
												<input
													id="f-track-label-{track.uid}"
													class="control"
													type="text"
													bind:value={track.label}
													oninput={() => form.touch()}
													aria-describedby={describedBy}
													aria-invalid={Boolean(form.entryErrors[`tracks.${i}.label`])}
												/>
											{/snippet}
										</FormField>
										<FormField
											id="f-track-url-{track.uid}"
											label="Direct link to the file"
											error={form.entryErrors[`tracks.${i}.media_url`]}
										>
											{#snippet children(describedBy)}
												<input
													id="f-track-url-{track.uid}"
													class="control"
													type="url"
													placeholder="https://"
													bind:value={track.media_url}
													oninput={() => form.touch()}
													aria-describedby={describedBy}
													aria-invalid={Boolean(form.entryErrors[`tracks.${i}.media_url`])}
												/>
											{/snippet}
										</FormField>
										<button
											type="button"
											class="clear-button"
											onclick={() => removeTrack(track.uid)}
										>
											Remove track {i + 1}
										</button>
									</div>
								{/each}

								{#if entry.tracks.length < MAX_TRACKS}
									<button type="button" class="btn btn-ghost" onclick={addTrack}>Add a track</button
									>
								{:else}
									<p class="note">
										That is the cap of {MAX_TRACKS}. Remove one if you would rather include
										something else; nothing is dropped silently.
									</p>
								{/if}

								<p class="note">
									<strong>No direct file? Skip this.</strong> Your entry still joins the ring with its
									cover art and a link out. It simply will not play here.
								</p>
							{:else if entry.type === 'comic'}
								<p>At least one page. Each is an image you host.</p>
								{#if form.entryErrors.pages}
									<p class="inline-error" role="alert">{form.entryErrors.pages}</p>
								{/if}
								{#each entry.pages as page, i (page.uid)}
									<div class="repeat-row" use:scrollNewRowIntoView={page.uid}>
										<FormField
											id="f-page-url-{page.uid}"
											label="Page {i + 1} image"
											required
											error={form.entryErrors[`pages.${i}.image_url`]}
										>
											{#snippet children(describedBy)}
												<input
													id="f-page-url-{page.uid}"
													class="control"
													type="url"
													placeholder="https://"
													bind:value={page.image_url}
													oninput={() => form.touch()}
													aria-describedby={describedBy}
													aria-invalid={Boolean(form.entryErrors[`pages.${i}.image_url`])}
												/>
											{/snippet}
										</FormField>
										<FormField id="f-page-cap-{page.uid}" label="Caption (optional)">
											{#snippet children(describedBy)}
												<input
													id="f-page-cap-{page.uid}"
													class="control"
													type="text"
													bind:value={page.caption}
													oninput={() => form.touch()}
													aria-describedby={describedBy}
												/>
											{/snippet}
										</FormField>
										<button type="button" class="clear-button" onclick={() => removePage(page.uid)}>
											Remove page {i + 1}
										</button>
									</div>
								{/each}
								<button type="button" class="btn btn-ghost" onclick={addPage}>Add a page</button>
							{:else if entry.type === 'text'}
								<FormField
									id="f-excerpt"
									label="A short sample"
									hint="Enough to give someone the voice of it. This is shown on the card itself."
									required
									error={form.entryErrors.excerpt}
								>
									{#snippet children(describedBy)}
										<textarea
											id="f-excerpt"
											class="control"
											rows="6"
											bind:value={entry.excerpt}
											oninput={() => form.touch()}
											aria-describedby={describedBy}
											aria-invalid={Boolean(form.entryErrors.excerpt)}></textarea>
									{/snippet}
								</FormField>
							{:else if entry.type === 'game'}
								<FormField
									id="f-preview"
									label="Muted preview clip (optional)"
									hint="Never plays audio on its own, and never autoplays with sound."
									error={form.entryErrors.preview_url}
								>
									{#snippet children(describedBy)}
										<input
											id="f-preview"
											class="control"
											type="url"
											placeholder="https://"
											bind:value={entry.preview_url}
											oninput={() => form.touch()}
											aria-describedby={describedBy}
											aria-invalid={Boolean(form.entryErrors.preview_url)}
										/>
									{/snippet}
								</FormField>
							{/if}

							{#if entry.has_own_site !== 'no'}
								<FormField
									id="f-thumb"
									label={entry.type === 'game' ? 'Screenshot or cover image' : 'Cover image'}
									hint={entry.type === 'game'
										? 'Required for games. This is the card. Any size works; wide screenshots read best.'
										: entry.type === 'audio'
											? 'Optional but strongly encouraged. Without one, your card falls back to a flat color. Square (1:1) is the norm for album art.'
											: 'Optional but strongly encouraged. Without one, your card falls back to a flat color. Square works well; other ratios are fine too.'}
									required={entry.type === 'game'}
									error={form.entryErrors.thumb_url}
								>
									{#snippet children(describedBy)}
										<input
											id="f-thumb"
											class="control"
											type="url"
											placeholder="https://"
											bind:value={entry.thumb_url}
											oninput={() => form.touch()}
											aria-describedby={describedBy}
											aria-invalid={Boolean(form.entryErrors.thumb_url)}
										/>
									{/snippet}
								</FormField>
							{:else if entry.type === 'audio'}
								<p class="note">
									A cover image is optional. You can add one for your generated page on the next
									step, and we will use it here too.
								</p>
							{/if}

							<div class="actions">
								<button type="button" class="btn btn-ghost" onclick={back}>Back</button>
								<button type="button" class="btn btn-primary" disabled={!canAdvance} onclick={next}>
									Continue
								</button>
							</div>
						{:else if form.step === 'site'}
							<h2 tabindex="-1" use:focusHeading>Build your page</h2>
							<p>
								A small page with your work on it, built from what you just uploaded. Pick a look,
								then download it and put it up wherever you like.
							</p>

							<FormField
								id="f-display-name"
								label="Name to show"
								hint="Defaults to your name or studio from the entry step."
							>
								{#snippet children(describedBy)}
									<input
										id="f-display-name"
										class="control"
										type="text"
										placeholder={entry.creator}
										value={generator.displayName ?? ''}
										oninput={(e) =>
											generatorDraftStore.save({
												generator: {
													displayName: /** @type {HTMLInputElement} */ (e.currentTarget).value
												}
											})}
										aria-describedby={describedBy}
									/>
								{/snippet}
							</FormField>

							<FormField
								id="f-bio"
								label="Bio (optional)"
								hint="A longer introduction for your page. Different from the one-line “why” on your ring card — this can actually breathe."
							>
								{#snippet children(describedBy)}
									<textarea
										id="f-bio"
										class="control"
										rows="5"
										value={generator.bio ?? ''}
										oninput={(e) =>
											generatorDraftStore.save({
												generator: {
													bio: /** @type {HTMLTextAreaElement} */ (e.currentTarget).value
												}
											})}
										aria-describedby={describedBy}></textarea>
								{/snippet}
							</FormField>

							<FormField
								id="f-icon"
								label="Icon or avatar (optional)"
								hint={generator.icon ? generator.icon.name : 'A small square image works best.'}
							>
								{#snippet children(describedBy)}
									<input
										id="f-icon"
										class="control"
										type="file"
										accept={ACCEPTED_IMAGE_TYPES.join(',')}
										onchange={updateIcon}
										aria-describedby={describedBy}
									/>
								{/snippet}
							</FormField>

							<FormField
								id="f-accent-color"
								label="Main color (optional)"
								hint="Overrides the template's own accent color. Leave alone to use the template's default."
							>
								{#snippet children(describedBy)}
									<input
										id="f-accent-color"
										class="control control-color"
										type="color"
										value={generator.accentColor ?? DEFAULT_ACCENT_COLOR}
										oninput={(e) =>
											generatorDraftStore.save({
												generator: {
													accentColor: /** @type {HTMLInputElement} */ (e.currentTarget).value
												}
											})}
										aria-describedby={describedBy}
									/>
								{/snippet}
							</FormField>

							<FormField
								id="f-widget-tier"
								label="Ring embed"
								hint="What gets embedded in your page's footer. All three link back to the ring the same way; this only changes how much room it takes."
							>
								{#snippet children(describedBy)}
									<div class="option-row" aria-describedby={describedBy}>
										{#each WIDGET_TIERS as tier (tier.id)}
											<label class="option">
												<input
													type="radio"
													name="widget_tier"
													value={tier.id}
													checked={(generator.widgetTier ?? 'widget') === tier.id}
													onchange={() =>
														generatorDraftStore.saveNow({ generator: { widgetTier: tier.id } })}
												/>
												<span class="option-label">{tier.label}</span>
											</label>
										{/each}
									</div>
								{/snippet}
							</FormField>

							{#if (generator.widgetTier ?? 'widget') === 'badge'}
								<FormField
									id="f-badge-style"
									label="Badge style"
									hint="Style is presentation only; every style links back to the ring the same way."
								>
									{#snippet children(describedBy)}
										<div class="option-row" aria-describedby={describedBy}>
											{#each badgeStylesFor(entry.type) as style (style.id)}
												<label class="option">
													<input
														type="radio"
														name="badge_style"
														value={style.id}
														checked={(generator.badgeStyle ?? 'classic') === style.id}
														onchange={() =>
															generatorDraftStore.saveNow({
																generator: { badgeStyle: style.id }
															})}
													/>
													<span class="option-label">{style.label}</span>
												</label>
											{/each}
										</div>
									{/snippet}
								</FormField>
							{/if}

							<h3>Elsewhere</h3>
							<p class="note">Optional links to anywhere else people can find you.</p>
							{#each generator.socialLinks ?? [] as social (social.uid)}
								<div class="repeat-row" use:scrollNewRowIntoView={social.uid}>
									<FormField id="f-social-label-{social.uid}" label="Label">
										{#snippet children(describedBy)}
											<input
												id="f-social-label-{social.uid}"
												class="control"
												type="text"
												placeholder="Bandcamp"
												value={social.label}
												oninput={(e) =>
													updateSocialLink(social.uid, {
														label: /** @type {HTMLInputElement} */ (e.currentTarget).value
													})}
												aria-describedby={describedBy}
											/>
										{/snippet}
									</FormField>
									<FormField id="f-social-url-{social.uid}" label="Link">
										{#snippet children(describedBy)}
											<input
												id="f-social-url-{social.uid}"
												class="control"
												type="url"
												placeholder="https://"
												value={social.url}
												oninput={(e) =>
													updateSocialLink(social.uid, {
														url: /** @type {HTMLInputElement} */ (e.currentTarget).value
													})}
												aria-describedby={describedBy}
											/>
										{/snippet}
									</FormField>
									{#if social.label || social.url}
										<p class="social-icon-preview">
											{@html socialIcon(social.label, social.url)}
											<span>Detected icon</span>
										</p>
									{/if}
									<button
										type="button"
										class="clear-button"
										onclick={() => removeSocialLink(social.uid)}
									>
										Remove
									</button>
								</div>
							{/each}
							<button type="button" class="btn btn-ghost" onclick={addSocialLink}>Add a link</button
							>

							{#if templateOptions.length}
								<h3>Look</h3>
								<div class="template-picker">
									{#each templateOptions as option (option.id)}
										<label class="template-option" class:checked={selectedTemplateId === option.id}>
											<input
												type="radio"
												name="template"
												value={option.id}
												checked={selectedTemplateId === option.id}
												onchange={() => selectTemplate(option.id)}
											/>
											{option.label}
										</label>
									{/each}
								</div>

								<div class="preview-frame-wrap">
									<div class="preview-frame-toolbar">
										<button
											type="button"
											class="btn btn-ghost"
											onclick={() => (previewModalOpen = true)}
										>
											View full size
										</button>
									</div>
									<div class="preview-frame-stage">
										<iframe
											class="preview-frame"
											class:preview-frame-inert={!previewScrollActive}
											title="Live preview of your page"
											srcdoc={previewSrcdoc}
										></iframe>
										{#if !previewScrollActive}
											<button
												type="button"
												class="preview-frame-overlay"
												onclick={() => (previewScrollActive = true)}
											>
												Click to scroll or interact inside the preview
											</button>
										{/if}
									</div>
								</div>

								<Modal
									open={previewModalOpen}
									title="Preview"
									dialogClass="preview-modal-dialog"
									onClose={() => (previewModalOpen = false)}
								>
									<iframe
										class="preview-frame-large"
										title="Live preview of your page, full size"
										srcdoc={previewSrcdoc}
									></iframe>
								</Modal>
							{/if}

							{#if exportMessage}
								<p class="note">{exportMessage}</p>
								{#if exportNeedsReload}
									<button
										type="button"
										class="btn btn-ghost"
										onclick={() => window.location.reload()}
									>
										Reload page
									</button>
								{/if}
							{/if}

							<div class="actions">
								<button type="button" class="btn btn-ghost" onclick={back}>Back</button>
								<button
									type="button"
									class="btn btn-primary"
									disabled={!hasBackend && !useMock}
									onclick={onExportSite}
								>
									{exporting ? 'Building…' : 'Download my page'}
								</button>
								<button type="button" class="btn btn-primary" disabled={!canAdvance} onclick={next}>
									Continue
								</button>
							</div>
						{:else if form.step === 'verify'}
							<h2 tabindex="-1" use:focusHeading>Prove the page is yours</h2>

							{#if entry.has_own_site === 'no'}
								<p>
									This confirms the page you just built and uploaded is really yours. Your token was
									already embedded in it when you downloaded it.
								</p>

								{#if !form.token}
									<p class="note">
										No token yet — go back to the previous step and download your page first.
									</p>
								{:else}
									<FormField
										id="f-source-derived"
										label="Where did you upload it?"
										hint="The address your page is live at now."
										required
									>
										{#snippet children(describedBy)}
											<input
												id="f-source-derived"
												class="control"
												type="url"
												inputmode="url"
												placeholder="https://"
												bind:value={sourceUrlDraft}
												aria-describedby={describedBy}
											/>
										{/snippet}
									</FormField>

									{#if form.verified}
										<p class="verified" role="status">✓ Verified. That page is yours.</p>
									{:else}
										<button
											type="button"
											class="btn btn-primary"
											disabled={form.pending !== 'idle' || !sourceUrlDraft.trim()}
											onclick={onBindSourceUrl}
										>
											{form.pending !== 'idle' ? 'Checking…' : 'Verify'}
										</button>
										{#if verifyMessage}
											<p class="inline-error" role="alert">{verifyMessage}</p>
										{/if}
									{/if}
								{/if}
							{:else}
								<p>
									This is the whole of the ownership check. It confirms that whoever submitted this
									entry can edit <code>{entry.source_url || 'the page you gave'}</code>.
								</p>

								{#if !form.token}
									<p>
										Press below and we will generate a token for you to place. It is tied to the URL
										above, so if you change that later you will need a new one.
									</p>
									<button
										type="button"
										class="btn btn-primary"
										disabled={form.pending !== 'idle'}
										onclick={() => form.requestToken()}
									>
										{form.pending === 'issuing' ? 'Generating…' : 'Generate my token'}
									</button>
								{:else}
									<p>Add this to the page's HTML:</p>
									<pre><code
											>&lt;meta name="indienode-verification" content="{form.token}" /&gt;</code
										></pre>
									<p class="note">
										You can remove it once you are verified. It expires on its own in 24 hours.
									</p>

									{#if form.verified}
										<p class="verified" role="status">✓ Verified. That page is yours.</p>
									{:else}
										<button
											type="button"
											class="btn btn-primary"
											disabled={form.pending !== 'idle'}
											onclick={() => form.runVerify()}
										>
											{form.pending === 'verifying' ? 'Checking…' : 'Verify'}
										</button>
										{#if verifyMessage}
											<p class="inline-error" role="alert">{verifyMessage}</p>
										{/if}
									{/if}
								{/if}
							{/if}

							{#if form.error}
								<p class="inline-error" role="alert">
									{form.error.message}
									{#if form.error.retryable}
										<button type="button" class="clear-button" onclick={() => form.clearError()}>
											Try again
										</button>
									{/if}
								</p>
							{/if}

							<div class="actions">
								<button type="button" class="btn btn-ghost" onclick={back}>Back</button>
								<button
									type="button"
									class="btn btn-primary"
									disabled={!form.verified}
									onclick={next}
								>
									Continue
								</button>
							</div>
						{:else if form.step === 'consent'}
							<h2 tabindex="-1" use:focusHeading>Rights and contact</h2>

							<FormField
								id="f-email"
								label="Your email"
								hint="Used once, to tell you whether this was accepted, then deleted. Not an account, not a mailing list, never published."
								required
								error={form.reviewErrors.email}
							>
								{#snippet children(describedBy)}
									<input
										id="f-email"
										class="control"
										type="email"
										autocomplete="email"
										bind:value={review.email}
										oninput={() => form.touch()}
										aria-describedby={describedBy}
										aria-invalid={Boolean(form.reviewErrors.email)}
									/>
								{/snippet}
							</FormField>

							<FormField
								id="f-pro"
								label="Are you a member of a performing rights organization?"
								hint="Asked for visibility only. It does not affect whether you are accepted."
								required
								error={form.reviewErrors.pro_membership}
							>
								{#snippet children(describedBy)}
									<select
										id="f-pro"
										class="control"
										bind:value={review.pro_membership}
										onchange={() => form.touch()}
										aria-describedby={describedBy}
										aria-invalid={Boolean(form.reviewErrors.pro_membership)}
									>
										<option value="" disabled>Choose one</option>
										{#each PRO_OPTIONS as option (option)}
											<option value={option}>{option}</option>
										{/each}
									</select>
								{/snippet}
							</FormField>

							<!-- Only "Other" leaves the actual organization unnamed; every
					     other option (ASCAP, BMI, ...) already named it by being
					     picked, and "Not a member"/"Not sure" have no name to give. -->
							{#if review.pro_membership === 'Other'}
								<FormField
									id="f-pro-name"
									label="Which organization?"
									required
									error={form.reviewErrors.pro_membership_name}
								>
									{#snippet children(describedBy)}
										<input
											id="f-pro-name"
											class="control"
											type="text"
											bind:value={review.pro_membership_name}
											oninput={() => form.touch()}
											aria-describedby={describedBy}
											aria-invalid={Boolean(form.reviewErrors.pro_membership_name)}
										/>
									{/snippet}
								</FormField>
							{/if}

							<!-- Rights renders in full rather than behind a link: a checkbox
					     next to a link to terms is not consent to the terms, a
					     checkbox under the text of them is closer. Worded for any
					     type of work, not just audio's "recording and composition";
					     the PRO sentence stays audio-specific since PRO membership
					     itself only means something for music. This box does not
					     gate Continue or Submit — see .eula-section below for the
					     one that does. -->
							<h3>Rights</h3>
							<label class="option consent">
								<input
									type="checkbox"
									bind:checked={review.rights_confirmation}
									onchange={() => form.touch()}
								/>
								<span class="option-description consent-text">
									I confirm that I hold full rights to what I am submitting, including that no third
									party such as a co-writer, sample owner, publisher, collaborator, or label holds a
									claim that would require separate compensation for its use on IndieNode.
									{#if entry.type === 'audio'}
										I understand that PRO membership does not prevent me from submitting, but I am
										disclosing it accurately above.
									{/if}
								</span>
							</label>

							<!-- The one consent that actually gates submission (see
					     `consentGiven` in submissionValidation.js), so it stays short
					     enough to read in full inline rather than living only behind
					     the "Read the full EULA" link — the full legal text is still
					     one click away via the modal below, for anyone who wants it. -->
							<h3>General EULA</h3>
							<label class="option consent">
								<input
									type="checkbox"
									bind:checked={review.eula_agreement}
									onchange={() => form.touch()}
								/>
								<span class="option-description consent-text">
									By submitting, you affirm you hold full rights to what you're submitting, and you
									agree that IndieNode operates on a donation-only basis: it collects no revenue
									from your work, and you waive any claim to compensation from IndieNode on that
									basis.
									<button type="button" class="link-button" onclick={() => (eulaModalOpen = true)}>
										Read the full EULA
									</button>
								</span>
							</label>

							<Modal
								open={eulaModalOpen}
								title="End User License Agreement"
								dialogClass="eula-modal-dialog"
								onClose={() => (eulaModalOpen = false)}
							>
								<EulaContent html={page.data.eulaHtml} />
							</Modal>

							<div class="actions">
								<button type="button" class="btn btn-ghost" onclick={back}>Back</button>
								<button type="button" class="btn btn-primary" disabled={!canAdvance} onclick={next}>
									Continue
								</button>
							</div>
						{:else}
							<h2 tabindex="-1" use:focusHeading>Review and send</h2>
							<p>This is exactly what will be added to the ring. Nothing else is published.</p>

							<dl class="review">
								<dt>Creator</dt>
								<dd>{entry.creator}</dd>
								<dt>Type</dt>
								<dd>{entry.type}</dd>
								<dt>Why</dt>
								<dd>{entry.why}</dd>
								<dt>Links to</dt>
								<dd class="wrap">{entry.source_url}</dd>
								<dt>Tags</dt>
								<dd>{entry.tags.join(', ')}</dd>
								{#if provisionalId}
									<dt>Entry id</dt>
									<dd><code>{provisionalId}</code> <span class="note-inline">may change</span></dd>
								{/if}
							</dl>

							<details class="help">
								<summary>See the exact data</summary>
								<pre><code>{JSON.stringify(form.preview, null, 2)}</code></pre>
							</details>

							<p class="note">
								Your email and the answers above it are sent for review only. They are never written
								to the ring, never appear in public, and are deleted once this submission is
								resolved.
							</p>

							<Honeypot bind:value={form.honeypot} />

							{#if form.error}
								<p class="inline-error" role="alert">{form.error.message}</p>
							{/if}

							<div class="actions">
								<button type="button" class="btn btn-ghost" onclick={back}>Back</button>
								<button
									type="button"
									class="btn btn-primary"
									disabled={(!hasBackend && !useMock) ||
										form.pending !== 'idle' ||
										!form.verified ||
										!form.consentGiven}
									onclick={() => form.send()}
								>
									{form.pending === 'submitting' ? 'Sending…' : 'Submit my entry'}
								</button>
							</div>

							<p class="footnote">
								A person reviews every submission before it appears. What that review checks is thin
								on purpose: that the link works, that the token was there, and that the type matches
								the content.
							</p>
						{/if}
					</div>
				{/key}
			</div>
		</div>
	{/if}
</div>

<style>
	/* This page deliberately does not scroll as a whole above the 60rem
	   breakpoint (see .join-layout below): every other route in this app
	   just lets the document scroll, there is no viewport-height chain
	   anywhere in src/routes/+layout.svelte or app.css to hook into, and
	   adding one globally would be a much bigger change than this one page
	   needs. So the height budget is computed locally instead, against the
	   one number that actually matters here: .page-transition's own
	   `padding: 5.5rem 1.65rem 1.65rem` in +layout.svelte, which is what
	   reserves room for the fixed header above this page. This file already
	   hardcodes that same 5.5rem elsewhere (the mobile .toc breakpoint
	   below), so this isn't a new kind of magic number for it. */
	.join-page {
		max-width: 72rem;
		margin: 0 auto;
		padding: 0 2rem 2rem;
		display: flex;
		flex-direction: column;
	}

	/* Deliberately smaller than this app's usual h1 (--text-2xl elsewhere):
	   on this page the heading is a title bar competing with the actual
	   stepper for the same fixed height budget (see .join-page above), not
	   a hero. --text-lg keeps it legible as a heading without being the
	   biggest thing that has to fit above the fold. */
	.page-title {
		flex-shrink: 0;
		margin: 1rem 0 0.9rem;
		font-size: var(--text-lg);
	}

	.interim-note {
		flex-shrink: 0;
		max-width: 60ch;
		margin-bottom: 0.9rem;
		padding: 0.7rem 1rem;
		border: 1px solid var(--border);
		border-left: 3px solid var(--accent);
		border-radius: var(--radius-sm);
		background: var(--bg-elevated);
	}

	.interim-note p {
		margin: 0;
		font-size: var(--text-xs);
	}

	.note-panel {
		max-width: 62ch;
		margin-bottom: 1.6rem;
		padding: 0.9rem 1.1rem;
		border: 1px solid var(--border);
		border-left: 3px solid var(--accent);
		border-radius: var(--radius-sm);
		background: var(--bg-elevated);
	}

	.note-panel .note {
		max-width: none;
	}

	/* Wider than the generic .note-panel: this one's own content (the "no
	   bigots" rule especially) genuinely needs more than 62ch to read as
	   short paragraphs rather than a ladder of half-empty lines. */
	.rules-panel {
		max-width: 68ch;
	}

	.rules-panel h3 {
		margin: 0 0 0.7rem;
		font-size: var(--text-base);
	}

	.rules-list {
		/* The app's Tailwind preflight zeroes list-style globally; restored
		   explicitly here since this is meant to read as an actual list. */
		list-style: disc;
		margin: 0;
		padding-left: 1.2rem;
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		color: var(--text-muted);
		font-size: var(--text-sm);
	}

	.rules-list li::marker {
		color: var(--accent);
	}

	/* GlassPanel itself ships unpadded on purpose (chrome/containers only;
	   callers supply their own — see its doc comment), so the success
	   screen needs its own rule here rather than inheriting one. :global()
	   is required because GlassPanel renders `class` inside its own
	   component scope, which this page's scoped styles cannot otherwise
	   reach (same pattern src/routes/+error.svelte already uses for its own
	   GlassPanel child). */
	/* 60ch, not the previous 46rem: 46rem rendered noticeably narrower than
	   .interim-note directly above it (60ch, same as everywhere else prose
	   width is capped in this file — see .consent, .repeat-row), which read
	   as this panel not using the width the page otherwise offers. Matching
	   the sibling above it is the fix, not un-capping it outright: unlimited
	   width would just make the paragraphs here uncomfortably long to read. */
	:global(.done-panel) {
		max-width: 60ch;
		margin: 1.4rem 0;
		padding: 2.2rem 2rem;
	}

	/* Spacing between GlassPanel's children (h2/p/h3/pre/button, authored
	   directly in this component's own template, so they already carry this
	   file's scope hash and need no :global() of their own — only the
	   anchor, .done-panel itself, does; see the comment above). Every child
	   previously had `margin: 0` (this app's global reset) and nothing
	   restored it, so the panel read as one unbroken block of text with no
	   breathing room between the reference, the intro, and the widget
	   section.

	   Listed explicitly (h2 excluded, since it always leads and needs no
	   top margin of its own) rather than a lobotomized-owl `* + *`, and the
	   whole compound selector wrapped in one :global(...) rather than just
	   the anchor (contrast .done-panel above): a child combinator crossing
	   into GlassPanel's own rendered output is something Svelte's
	   unused-selector pruning cannot verify from this component's own
	   template tree alone, component boundaries are opaque to it, so
	   `:global(.done-panel) > p` compiled to *nothing* and silently dropped
	   the whole rule — every child kept rendering with zero spacing despite
	   this appearing to be in the stylesheet. Wrapping the full selector
	   opts it out of that check entirely instead of trying to satisfy it. */
	:global(.done-panel > p),
	:global(.done-panel > h3),
	:global(.done-panel > pre),
	:global(.done-panel > button) {
		margin-top: 1.2rem;
	}

	:global(.done-panel > h3) {
		margin-top: 2rem;
	}

	/* Its own centered line rather than folded into the sentence above it:
	   a reference code is something a submitter comes back to copy or quote
	   later, not just read in passing, so it gets to stand out instead of
	   sitting mid-paragraph. */
	.reference-block {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.3rem;
		padding: 1rem;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--bg-elevated);
		text-align: center;
	}

	.reference-label {
		font-size: var(--text-xs);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-muted);
	}

	.reference-code {
		font-size: var(--text-lg);
		font-weight: 700;
		letter-spacing: 0.02em;
	}

	/* Centered rather than left-aligned like the rest of the panel's flow
	   content: this is the one action on the success screen, closing it out
	   rather than continuing to read alongside the text above it, so it
	   earns standing apart the way a dialog's own primary action would. */
	.submit-again-button {
		display: block;
		margin-inline: auto;
	}

	@media (max-width: 30rem) {
		:global(.done-panel) {
			padding: 1.6rem 1.4rem;
		}
	}

	/* A single column now: the horizontal StepProgress bar, then the panel
	   below it. The former two-column grid (a 15rem sidebar stepper beside
	   the panel) is gone along with the sidebar itself — see StepProgress.svelte
	   for what replaced it and why it is a plain progress indicator rather
	   than a click-to-jump tab list the sidebar was. */
	.join-layout {
		display: flex;
		flex-direction: column;
		gap: 1.75rem;
		/* Belt and suspenders with .panel/.step-body's own max-height clamp:
		   without this, content inside a step (the preview iframe in
		   particular) could still push .join-layout itself taller than the
		   flex-constrained space min-height: 0 makes available, growing the
		   whole fixed-height screen rather than staying capped and scrolling
		   internally. A hard clip here guarantees the reserved viewport
		   budget is never exceeded regardless of what a given step renders. */
		overflow: hidden;
	}

	/* Fixed-height only above the breakpoint where this still reads as a
	   single, self-contained screen (see the 60rem breakpoint further down,
	   which reverts this and everything under it to ordinary page flow on a
	   short or narrow viewport). `calc` subtracts .page-transition's own
	   reservation plus this element's own top margin from the viewport, so
	   .join-layout gets exactly the room left over rather than growing with
	   content and pushing the page into a scroll nobody asked for. */
	@media (min-width: 60.01rem) {
		.join-page {
			height: calc(100dvh - 5.5rem - 1.65rem);
			min-height: 0;
		}

		.join-layout {
			flex: 1;
			min-height: 0;
		}
	}

	.panel {
		min-width: 0;
		/* Required by out:outFade below, which takes the outgoing step
		   absolute so it overlays the incoming one instead of both occupying
		   flow at once (see transitions.js's own doc comment). */
		position: relative;
	}

	@media (min-width: 60.01rem) {
		.panel {
			/* max-height, not height: a short step (few fields, no preview)
			   used to still be stretched to the full reserved viewport height
			   regardless, leaving a dead gap below its own action buttons —
			   visible, unbordered empty space down to where a long step's
			   content would have reached. max-height keeps the same cap for a
			   step that actually needs it (internal scroll still takes over
			   exactly as before) while letting a shorter step's panel size to
			   its own content instead of stretching past it. */
			max-height: 100%;
			min-height: 0;
			display: flex;
			flex-direction: column;
		}
	}

	/* The one scroll region on this page above 60rem: short steps never fill
	   it, so no scrollbar appears; consent's legal text is the deliberate
	   exception that does. Below 60rem this is a no-op, since .panel isn't
	   height-constrained there and the page scrolls as a whole instead. */
	.step-body {
		overflow-y: auto;
		max-height: 100%;
		min-height: 0;
	}

	.step-body h2:focus-visible {
		outline-offset: 4px;
	}

	.panel h2 {
		margin-bottom: 0.8rem;
	}

	.panel h3 {
		margin: 2rem 0 0.6rem;
	}

	.panel p {
		max-width: 62ch;
		margin-bottom: 1.2rem;
	}

	.checklist {
		max-width: 62ch;
		margin: 0 0 2rem;
		padding-left: 0;
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: 0.9rem;
	}

	.checklist li {
		display: flex;
		align-items: flex-start;
		gap: 0.75rem;
	}

	.checklist-icon {
		flex-shrink: 0;
		margin-top: 0.1rem;
		color: var(--accent);
	}

	/* .control's own width:100% + text-input padding reads as a giant,
	   oddly-padded swatch on a native color picker, which has no text
	   inside it to pad around. Keep the border/radius language, drop the
	   padding, and size it like the small square control it actually is. */
	.control-color {
		width: 3.5rem;
		height: 2.6rem;
		padding: 0.2rem;
		cursor: pointer;
	}

	.help {
		max-width: 62ch;
		margin-bottom: 2rem;
		padding: 0.9rem 1.1rem;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--bg-elevated);
	}

	.help summary {
		cursor: pointer;
		font-weight: 600;
		font-size: var(--text-sm);
	}

	.help > *:not(summary) {
		margin-top: 1rem;
	}

	.table-scroll {
		overflow-x: auto;
		margin-bottom: 1.2rem;
	}

	table {
		width: 100%;
		border-collapse: collapse;
		font-size: var(--text-sm);
	}

	th,
	td {
		padding: 0.6rem 0.8rem;
		border-bottom: 1px solid var(--border);
		text-align: left;
		vertical-align: top;
	}

	thead th {
		color: var(--text-muted);
		font-size: var(--text-xs);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	tbody th {
		font-weight: 600;
		white-space: nowrap;
	}

	.req {
		display: inline-block;
		padding: 0.1rem 0.5rem;
		border-radius: 999px;
		font-size: var(--text-xs);
		font-weight: 600;
		white-space: nowrap;
	}

	.req[data-req='yes'] {
		background: var(--type-game-soft);
		color: var(--type-game);
	}

	.req[data-req='no'] {
		background: var(--bg-elevated);
		color: var(--text-faint);
		border: 1px solid var(--border);
	}

	pre {
		overflow-x: auto;
		margin-bottom: 1.2rem;
		padding: 0.9rem 1rem;
		border-radius: var(--radius-sm);
		border: 1px solid var(--border);
		background: var(--bg-elevated);
		font-size: var(--text-sm);
		line-height: 1.5;
	}

	.note {
		max-width: 62ch;
		color: var(--text-muted);
		font-size: var(--text-sm);
	}

	.note a {
		color: var(--accent);
	}

	.note-inline {
		color: var(--text-faint);
		font-size: var(--text-xs);
	}

	.hint-inline {
		margin-bottom: 0.5rem !important;
		color: var(--text-muted);
		font-size: var(--text-sm);
	}

	.counter {
		margin-top: -1.4rem;
		margin-bottom: 1.8rem !important;
		color: var(--text-faint);
		font-size: var(--text-xs);
		text-align: right;
		max-width: 100%;
	}

	.counter.over {
		color: #e0455f;
	}

	.tag-list {
		display: flex;
		flex-wrap: wrap;
		gap: 0.7rem;
		margin: 0 0 1.6rem;
		padding: 0;
		list-style: none;
	}

	/* Its own highlighted container rather than one more plain checkbox in
	   the list above it: this is the one field on this step with real
	   consequences if it's wrong in either direction (mislabeled explicit
	   content reaching someone who opted out, or genuinely explicit work
	   left unlabeled), so it earns visually standing apart from "what kind
	   of work is this" and "tags." Amber rather than this page's usual
	   accent border, the same "pay attention here" register a caution color
	   carries everywhere else it's used. */
	.explicit-panel {
		margin: 1rem 0 2rem;
		max-width: 62ch;
		padding: 1.1rem 1.3rem;
		border: 1px solid rgb(234 179 8 / 0.5);
		border-radius: var(--radius-sm);
		background: rgb(234 179 8 / 0.1);
	}

	.explicit-panel .option {
		margin: 0;
	}

	.explicit-examples {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem 1.5rem;
		margin-top: 1rem;
		padding-top: 1rem;
		border-top: 1px solid rgb(234 179 8 / 0.35);
	}

	.explicit-examples-title {
		margin: 0 0 0.4rem;
		color: var(--text);
		font-size: var(--text-xs);
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}

	.explicit-examples ul {
		margin: 0;
		padding-left: 1.1rem;
		list-style: disc;
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		color: var(--text-muted);
		font-size: var(--text-xs);
	}

	@media (max-width: 32rem) {
		.explicit-examples {
			grid-template-columns: 1fr;
		}
	}

	.consent {
		max-width: 66ch;
		margin-bottom: 1.6rem;
		padding: 1rem 1.2rem;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--bg-elevated);
	}

	.consent-text {
		font-size: var(--text-sm);
		line-height: 1.55;
	}

	/* An inline text link that happens to be a <button> (it opens a modal,
	   not a URL), styled to read as part of the surrounding sentence rather
	   than as its own control. */
	.link-button {
		padding: 0;
		border: none;
		background: none;
		font: inherit;
		font-size: inherit;
		color: var(--accent);
		text-decoration: underline;
		cursor: pointer;
	}

	.repeat-row {
		max-width: 62ch;
		margin-bottom: 1.6rem;
		padding: 1.2rem 1.2rem 0.8rem;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
	}

	.social-icon-preview {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin: 0 0 0.8rem;
		color: var(--text-muted);
		font-size: 0.85rem;
	}

	.social-icon-preview :global(svg) {
		flex-shrink: 0;
		width: 1.1rem;
		height: 1.1rem;
	}

	.option-row {
		display: flex;
		flex-wrap: wrap;
		gap: 1.4rem;
	}

	.template-picker {
		display: flex;
		flex-wrap: wrap;
		gap: 0.8rem;
		margin-bottom: 1.6rem;
	}

	.template-option {
		padding: 0.6rem 1.1rem;
		border: 1px solid var(--border);
		border-radius: 999px;
		font-size: var(--text-sm);
		font-weight: 600;
		cursor: pointer;
	}

	.template-option input {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}

	.template-option.checked {
		border-color: var(--accent);
		color: var(--accent);
	}

	/* Full width of the panel, not the 62ch text-measure the rest of this
	   form's fields use: a narrower iframe here doesn't shrink what it
	   renders, it just gives the generated page's own layout less room to
	   work with, which forced its wider sections (a template's own
	   full-bleed bands, say) into their own horizontal scroll *inside* the
	   iframe — on top of the panel's ordinary vertical scroll outside it,
	   which is what read as two scrollbars at once. */
	.preview-frame-wrap {
		width: 100%;
		margin-bottom: 1.6rem;
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		overflow: hidden;
	}

	.preview-frame-toolbar {
		display: flex;
		justify-content: flex-end;
		padding: 0.5rem;
		border-bottom: 1px solid var(--border);
		background: var(--bg-elevated);
	}

	/* .btn's own padding/font-size (0.7rem 1.4rem, --text-base) is sized for
	   a primary action like the step's own Back/Continue buttons below —
	   applied here it made this small utility toolbar reserve nearly 80px of
	   height for one secondary control, a real, if easy-to-miss, contributor
	   to the step reading longer than it needed to. Shrunk to toolbar scale
	   instead. */
	.preview-frame-toolbar .btn {
		padding: 0.35rem 0.8rem;
		font-size: var(--text-xs);
	}

	/* Positioning context for .preview-frame-overlay, scoped to just the
	   iframe itself rather than the toolbar above it. */
	.preview-frame-stage {
		position: relative;
	}

	.preview-frame {
		display: block;
		width: 100%;
		/* Was 32rem, then 22rem, then 15rem while this step's own length was
		   the problem being chased directly. With .join-layout's overflow:
		   hidden and .panel/.step-body's max-height clamp actually
		   containing the step regardless of what it renders (see both their
		   own comments), the preview no longer needs to be shrunk this far
		   just to keep the step from overflowing its reserved space — 31rem
		   gives a genuinely useful preview back, short only of the original
		   32rem. */
		height: 31rem;
		border: none;
	}

	/* Belt and suspenders with .preview-frame-overlay below: an iframe is
	   its own nested browsing context with its own scroll-hit-testing
	   region, and a merely-visual overlay on top of it isn't reliably
	   enough to keep a wheel gesture from still routing into the iframe's
	   own document underneath (confirmed directly: with only the overlay in
	   place, wheeling over it still scrolled the iframe's content instead
	   of `.step-body`). `pointer-events: none` removes the iframe from hit
	   testing altogether — for clicks and for scroll — while inactive, so
	   there is nothing under the overlay for either kind of event to reach. */
	.preview-frame-inert {
		pointer-events: none;
	}

	/* Wheel/pointer events over an iframe go to *its own* document, not the
	   outer page — hovering the preview while scrolling silently hijacks
	   the scroll into the iframe instead of moving `.step-body`, with no
	   visual cue that happened. This overlay sits on top of the iframe
	   until clicked, both as the visible cue and (paired with
	   .preview-frame-inert above) to keep every such event on the outer
	   page; clicking it removes the overlay and the inert flag together,
	   opting the visitor in to scrolling/interacting inside the preview. */
	.preview-frame-overlay {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1rem;
		text-align: center;
		font-size: var(--text-sm);
		/* Fixed light text, not the `--text` token: the scrim behind it is
		   always dark regardless of site theme, so a token that flips to
		   near-black text in light mode would be unreadable here. */
		color: #f4f4f5;
		background: rgb(0 0 0 / 0.35);
		border: none;
		cursor: pointer;
	}

	.preview-frame-overlay:hover {
		background: rgb(0 0 0 / 0.45);
	}

	/* Modal.svelte's own dialog is sized for text content (48rem, padded);
	   this is the one caller (see Modal's own doc comment on dialogClass)
	   that wants to fill most of the viewport instead, so the preview
	   actually gets room to be inspected rather than just repeating the
	   inline iframe's own cramped size inside a dialog frame.

	   !important on the sizing properties only: Svelte's own scoping adds
	   an attribute selector to `.dialog`'s rule inside Modal.svelte, which
	   outranks a same-specificity plain class here regardless of the two
	   stylesheets' relative bundling order — this is the one place in this
	   file overriding another component's internals by design (exactly
	   what `dialogClass` exists for), so it says so outright rather than
	   gambling on a selector/order trick to win the same fight indirectly. */
	:global(.preview-modal-dialog) {
		width: 92vw !important;
		max-width: 92vw !important;
		height: 92vh !important;
		max-height: 92vh !important;
		padding: 1.25rem;
		display: flex;
		flex-direction: column;
	}

	:global(.preview-modal-dialog .dialog-header) {
		flex-shrink: 0;
	}

	:global(.preview-modal-dialog .dialog-body) {
		flex: 1;
		min-height: 0;
		display: flex;
	}

	.preview-frame-large {
		display: block;
		flex: 1;
		width: 100%;
		height: 100%;
		border: none;
		border-radius: var(--radius-sm);
	}

	/* Second `dialogClass` caller (see the comment above
	   `.preview-modal-dialog`): the EULA's two-column metadata block and
	   definitions list read as cramped at Modal's default 48rem text width,
	   so this widens the dialog without touching its height/scroll behavior,
	   which the 48rem default already gets right for a long document. */
	:global(.eula-modal-dialog) {
		width: min(92vw, 64rem) !important;
		max-width: min(92vw, 64rem) !important;
	}

	.inline-error {
		max-width: 62ch;
		color: #e0455f;
		font-size: var(--text-sm);
	}

	.verified {
		color: var(--type-game);
		font-weight: 600;
	}

	.review {
		display: grid;
		grid-template-columns: max-content minmax(0, 1fr);
		gap: 0.6rem 1.4rem;
		max-width: 62ch;
		margin-bottom: 2rem;
	}

	.review dt {
		color: var(--text-muted);
		font-size: var(--text-sm);
	}

	.review dd {
		margin: 0;
	}

	.review dd.wrap {
		overflow-wrap: anywhere;
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 1rem;
		margin-top: 2.4rem;
	}

	.footnote {
		margin-top: 2rem;
		padding-top: 1.2rem;
		border-top: 1px solid var(--border);
		color: var(--text-muted);
		font-size: var(--text-sm);
	}

	@media (max-width: 60rem) {
		.join-page {
			padding: 2rem 1.2rem 4rem;
		}

		.join-layout {
			gap: 1.4rem;
		}

		/* .panel keeps position: relative at every width — out:outFade below
		   needs a positioned ancestor to anchor its overlay against
		   regardless of screen size, only the height-locking (desktop-only,
		   see the 60.01rem query above) is what's different per breakpoint.
		   StepProgress handles its own responsive label collapse internally
		   (see its own ~30rem breakpoint), so nothing here needs to react to
		   it — the vertical sidebar this replaced needed page-level
		   breakpoint overrides of its own; a horizontal bar that is already
		   full-width does not. */
		.step-body {
			overflow-y: visible;
			height: auto;
		}
	}
</style>
