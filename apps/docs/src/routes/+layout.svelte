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
		<nav>
			{#each sections as section (section.href)}
				<a href="{base}{section.href}" class:is-on={current === section.href}>{section.label}</a>
			{/each}
		</nav>
		<a class="github" href="https://github.com/0xershtein/arcflow">GitHub</a>
	</header>

	<main>
		{@render children()}
	</main>

	<footer>
		<span>MIT licensed. Built with <a href="https://svelte.dev">Svelte</a> and <a href="https://svelteflow.dev">Svelte Flow</a>.</span>
		<a href="https://github.com/0xershtein/arcflow">Source</a>
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
		--brand-bg: #18181b;
		--mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
		--font: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
		color-scheme: light;
	}

	@media (prefers-color-scheme: dark) {
		:global(:root) {
			--bg: #0f0f11;
			--surface: #18181b;
			--surface-2: #141417;
			--line: #27272a;
			--line-strong: #3f3f46;
			--text: #fafafa;
			--text-soft: #d4d4d8;
			--text-muted: #a1a1aa;
			--accent: #818cf8;
			--brand-bg: #09090b;
			color-scheme: dark;
		}
	}

	:global(html) {
		scroll-behavior: smooth;
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

	nav {
		display: flex;
		gap: 4px;
		flex: 1;
		overflow-x: auto;
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
		font-size: 14px;
		color: var(--text-muted);
		text-decoration: none;
	}

	.github:hover {
		color: var(--text);
	}

	main {
		flex: 1;
		width: 100%;
		max-width: 860px;
		margin: 0 auto;
		padding: 48px 24px 80px;
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
