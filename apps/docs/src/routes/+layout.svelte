<script lang="ts">
	import { base } from '$app/paths';
	import { page } from '$app/state';

	let { children } = $props();

	const sections = [
		{ href: '/', label: 'Overview' },
		{ href: '/quick-start', label: 'Quick start' },
		{ href: '/flows', label: 'Flows & steps' },
		{ href: '/editor', label: 'Editor' },
		{ href: '/server', label: 'Server' },
		{ href: '/ai', label: 'AI & agents' }
	];

	// The site can be served under a base path (a GitHub project page), so compare without it.
	const current = $derived((page.url.pathname.slice(base.length) || '/').replace(/(.)\/$/, '$1'));

	const slug = (text: string) =>
		text
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-|-$/g, '');

	let toc = $state<{ id: string; text: string }[]>([]);
	let here = $state<string | null>(null);

	/**
	 * The sections come from the page's own headings rather than a list kept beside it,
	 * so adding a section to a page adds it to the sidebar. Ids are set here too, which
	 * is what makes every section linkable.
	 */
	$effect(() => {
		current;
		let headings: HTMLHeadingElement[] = [];
		let timer: ReturnType<typeof setTimeout> | null = null;

		/**
		 * The section being read is the last heading that has passed the top of the
		 * window. Asking which heading is on screen instead leaves the mark behind
		 * whenever a long section fills the whole viewport.
		 */
		const mark = () => {
			// The last section can never reach the top of the window, so the foot of the
			// page counts as being in it.
			if (headings.length && innerHeight + scrollY >= document.documentElement.scrollHeight - 2) {
				here = headings[headings.length - 1].id;
				return;
			}
			let seen = headings[0]?.id ?? null;
			for (const heading of headings) {
				if (heading.getBoundingClientRect().top > 90) break;
				seen = heading.id;
			}
			here = seen;
		};

		const onScroll = () => {
			if (timer) return;
			timer = setTimeout(() => {
				timer = null;
				mark();
			}, 80);
		};

		// The page's markup is already in the DOM by the time an effect runs, so this
		// reads it directly rather than waiting for a frame that a background tab never paints.
		headings = [...document.querySelectorAll<HTMLHeadingElement>('main h2')];
		for (const heading of headings) heading.id ||= slug(heading.textContent ?? '');
		toc = headings.map((heading) => ({ id: heading.id, text: heading.textContent?.trim() ?? '' }));
		mark();

		addEventListener('scroll', onScroll, { passive: true });
		addEventListener('resize', onScroll, { passive: true });
		return () => {
			if (timer) clearTimeout(timer);
			removeEventListener('scroll', onScroll);
			removeEventListener('resize', onScroll);
		};
	});
</script>

<div class="shell">
	<header>
		<a class="brand" href="{base}/">
			<svg viewBox="0 0 32 32" width="26" height="26" aria-hidden="true">
				<rect width="32" height="32" rx="7" fill="var(--brand-bg)" />
				<g fill="none" stroke="var(--accent)" stroke-width="2.2" stroke-linecap="round">
					<path d="M8 11h5c3.5 0 3.5 10 7 10h4" />
					<circle cx="8" cy="11" r="2.4" fill="var(--accent)" stroke="none" />
					<circle cx="24" cy="21" r="2.4" fill="var(--accent)" stroke="none" />
				</g>
			</svg>
			arcflow
		</a>
		<nav class="top-nav">
			{#each sections as section (section.href)}
				<a href="{base}{section.href}" class:is-on={current === section.href}>{section.label}</a>
			{/each}
		</nav>
		<a class="github" href="https://github.com/arcsig-labs/arcflow">GitHub</a>
	</header>

	<div class="body" class:is-landing={current === '/'}>
		<aside>
			<nav class="pages" aria-label="Documentation">
				{#each sections as section (section.href)}
					<a class="page" href="{base}{section.href}" class:is-on={current === section.href}>{section.label}</a>
					{#if current === section.href && toc.length > 1}
						<ul>
							{#each toc as entry (entry.id)}
								<li><a href="#{entry.id}" class:is-here={here === entry.id}>{entry.text}</a></li>
							{/each}
						</ul>
					{/if}
				{/each}
			</nav>
		</aside>

		<main>
			{@render children()}
		</main>
	</div>

	<footer>
		<span>MIT licensed. Built with <a href="https://svelte.dev">Svelte</a> and <a href="https://svelteflow.dev">Svelte Flow</a>.</span>
		<a href="https://github.com/arcsig-labs/arcflow">Source</a>
	</footer>
</div>

<style>
	:global(:root) {
		--bg: #ffffff;
		--surface: #ffffff;
		--surface-2: #fafafa;
		--line: #e4e4e7;
		--line-strong: #d4d4d8;
		--text: #18181b;
		--text-soft: #3f3f46;
		--text-muted: #71717a;
		--accent: #4f46e5;
		--accent-ink: #ffffff;
		--brand-bg: #18181b;
		--mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
		--font: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
		color-scheme: light;
	}

	/* Dark by default where the reader's system asks for it, and overridable either way:
	   the editor already answers to data-theme, so the site does too. */
	@media (prefers-color-scheme: dark) {
		:global(:root:not([data-theme='light'])) {
			--bg: #0f0f11;
			--surface: #18181b;
			--surface-2: #141417;
			--line: #27272a;
			--line-strong: #3f3f46;
			--text: #fafafa;
			--text-soft: #d4d4d8;
			--text-muted: #a1a1aa;
			--accent: #818cf8;
			--accent-ink: #0f0f11;
			--brand-bg: #09090b;
			color-scheme: dark;
		}
	}

	:global(:root[data-theme='dark']) {
			--bg: #0f0f11;
			--surface: #18181b;
			--surface-2: #141417;
			--line: #27272a;
			--line-strong: #3f3f46;
			--text: #fafafa;
			--text-soft: #d4d4d8;
			--text-muted: #a1a1aa;
			--accent: #818cf8;
			--accent-ink: #0f0f11;
			--brand-bg: #09090b;
			color-scheme: dark;
	}

	:global(*),
	:global(*::before),
	:global(*::after) {
		box-sizing: border-box;
	}

	@media (prefers-reduced-motion: no-preference) {
		:global(html) {
			scroll-behavior: smooth;
		}
	}

	:global(html) {
		/* The parts nobody draws: they ship with browser defaults that belong to no palette. */
		scrollbar-color: var(--line-strong) transparent;
	}

	:global(::selection) {
		background: color-mix(in srgb, var(--accent) 24%, transparent);
	}

	:global(:focus-visible) {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}

	:global(a) {
		text-underline-offset: 3px;
		text-decoration-thickness: from-font;
	}

	:global(table),
	:global(time) {
		font-variant-numeric: tabular-nums;
	}

	:global(body) {
		margin: 0;
		background: var(--bg);
		color: var(--text);
		font-family: var(--font);
		line-height: 1.6;
		-webkit-font-smoothing: antialiased;
	}

	:global(h1) {
		font-size: clamp(30px, 4vw, 42px);
		line-height: 1.15;
		letter-spacing: -0.03em;
		margin: 0 0 16px;
	}

	:global(h2) {
		margin: 48px 0 12px;
		font-size: 22px;
		letter-spacing: -0.02em;
		/* Clear of the sticky header when a sidebar link jumps here. */
		scroll-margin-top: 78px;
	}

	:global(h3) {
		margin: 32px 0 8px;
		font-size: 16px;
	}

	:global(p) {
		margin: 0 0 16px;
		color: var(--text-soft);
	}

	:global(a) {
		color: var(--accent);
	}

	:global(code) {
		font-family: var(--mono);
		font-size: 0.92em;
	}

	:global(p code, li code, td code) {
		padding: 1px 5px;
		border-radius: 5px;
		background: var(--surface-2);
		border: 1px solid var(--line);
		color: var(--text);
	}

	:global(table) {
		width: 100%;
		margin: 0 0 24px;
		border-collapse: collapse;
		font-size: 14px;
	}

	:global(th) {
		text-align: left;
		font-weight: 600;
	}

	:global(th, td) {
		padding: 9px 12px;
		border-bottom: 1px solid var(--line);
		vertical-align: top;
		color: var(--text-soft);
	}

	:global(ul) {
		margin: 0 0 16px;
		padding-left: 20px;
		color: var(--text-soft);
	}

	:global(li) {
		margin-bottom: 6px;
	}

	.shell {
		min-height: 100vh;
		display: flex;
		flex-direction: column;
	}

	header {
		position: sticky;
		top: 0;
		z-index: 10;
		display: flex;
		align-items: center;
		gap: 24px;
		padding: 12px 28px;
		border-bottom: 1px solid var(--line);
		background: color-mix(in srgb, var(--bg) 88%, transparent);
		backdrop-filter: blur(8px);
	}

	.brand {
		display: inline-flex;
		align-items: center;
		gap: 9px;
		font-weight: 650;
		font-size: 16px;
		color: var(--text);
		text-decoration: none;
		letter-spacing: -0.02em;
	}

	.top-nav {
		display: none;
		gap: 4px;
		flex: 1;
		overflow-x: auto;
	}

	.shell:has(.is-landing) .top-nav {
		display: flex;
	}

	nav a {
		padding: 6px 10px;
		border-radius: 7px;
		font-size: 14px;
		color: var(--text-muted);
		text-decoration: none;
		white-space: nowrap;
	}

	nav a:hover {
		color: var(--text);
		background: var(--surface-2);
	}

	nav a.is-on {
		color: var(--text);
		background: var(--surface-2);
	}

	.github {
		margin-left: auto;
		font-size: 14px;
		color: var(--text-muted);
		text-decoration: none;
	}

	.github:hover {
		color: var(--text);
	}

	/* The landing has no sidebar: it is a page to read once, not to navigate. */
	.body.is-landing {
		grid-template-columns: minmax(0, 1fr);
		max-width: 1180px;
	}

	.body.is-landing aside {
		display: none;
	}

	.body.is-landing main {
		max-width: 100%;
		padding-top: 36px;
	}

	/* Sidebar beside the text, both centred together so the text stays where it was. */
	.body {
		flex: 1;
		width: 100%;
		max-width: 1140px;
		margin: 0 auto;
		display: grid;
		grid-template-columns: 232px minmax(0, 1fr);
		gap: 24px;
	}

	aside {
		padding: 44px 0 80px 20px;
	}

	.pages {
		position: sticky;
		top: 72px;
		max-height: calc(100vh - 96px);
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding-right: 8px;
	}

	.pages .page {
		padding: 6px 10px;
		border-radius: 7px;
		font-size: 14px;
		color: var(--text-muted);
		text-decoration: none;
	}

	.pages .page:hover {
		color: var(--text);
		background: var(--surface-2);
	}

	.pages .page.is-on {
		color: var(--text);
		font-weight: 600;
	}

	.pages ul {
		margin: 2px 0 8px;
		padding: 0 0 0 11px;
		list-style: none;
		border-left: 1px solid var(--line);
	}

	.pages li {
		margin: 0;
	}

	.pages li a {
		display: block;
		padding: 4px 8px;
		border-radius: 6px;
		font-size: 13.5px;
		line-height: 1.4;
		color: var(--text-muted);
		text-decoration: none;
	}

	.pages li a:hover {
		color: var(--text);
		background: var(--surface-2);
	}

	.pages li a.is-here {
		color: var(--accent);
	}

	main {
		min-width: 0;
		max-width: 860px;
		padding: 44px 24px 80px;
	}

	footer {
		display: flex;
		justify-content: space-between;
		gap: 16px;
		flex-wrap: wrap;
		padding: 20px 28px;
		border-top: 1px solid var(--line);
		font-size: 13px;
		color: var(--text-muted);
	}

	/* Too narrow for a column of its own: navigation goes back into the header. */
	@media (max-width: 960px) {
		.body {
			grid-template-columns: minmax(0, 1fr);
		}

		aside {
			display: none;
		}

		.top-nav {
			display: flex;
		}

		/* Auto margins stop a grid item from stretching, so without a width it grows to its
		   widest code line and the page scrolls sideways on a phone. */
		main {
			width: 100%;
			margin: 0 auto;
		}
	}

	@media (max-width: 720px) {
		header {
			padding: 10px 16px;
			gap: 12px;
		}
		.github {
			display: none;
		}
	}
</style>
