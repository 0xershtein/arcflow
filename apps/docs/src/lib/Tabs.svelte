<script lang="ts">
	import { browser } from '$app/environment';
	import Code from './Code.svelte';
	import type { FrameworkSnippet } from './frameworks';

	/** Code for the same job in several frameworks, with the reader's choice remembered. */
	let { tabs, group = 'framework' }: { tabs: FrameworkSnippet[]; group?: string } = $props();

	const key = $derived(`arcflow.docs.${group}`);
	/** Null means "whichever tab comes first", so the prerendered page needs no choice. */
	let chosen = $state<string | null>(null);

	// Restored after hydration rather than at init, so the prerendered page and the
	// first client render agree.
	$effect(() => {
		if (!browser) return;
		try {
			const saved = localStorage.getItem(key);
			if (saved && tabs.some((tab) => tab.id === saved)) chosen = saved;
		} catch {
			// A blocked store only costs the remembered choice.
		}
	});

	const shown = $derived(tabs.find((tab) => tab.id === chosen) ?? tabs[0]);

	function pick(id: string) {
		chosen = id;
		try {
			localStorage.setItem(key, id);
		} catch {
			// Same as above.
		}
	}
</script>

<div class="tabs">
	<div class="row" role="tablist" aria-label="Framework">
		{#each tabs as tab (tab.id)}
			<button role="tab" aria-selected={chosen === tab.id} class:on={chosen === tab.id} onclick={() => pick(tab.id)}>
				{tab.label}
			</button>
		{/each}
	</div>
	<Code code={shown.code} language={shown.language} />
</div>

<style>
	.tabs {
		margin: 0 0 24px;
	}

	.row {
		display: flex;
		gap: 2px;
		margin-bottom: 8px;
	}

	button {
		padding: 6px 14px;
		border: 1px solid transparent;
		border-radius: 8px;
		background: transparent;
		color: var(--text-muted);
		font: inherit;
		font-size: 14px;
		cursor: pointer;
	}

	button:hover {
		color: var(--text);
		background: var(--surface-2);
	}

	button.on {
		border-color: var(--line);
		background: var(--surface-2);
		color: var(--text);
		font-weight: 600;
	}

	/* The code block carries its own margin; the tabs sit right on top of it. */
	.tabs :global(.code) {
		margin-bottom: 0;
	}
</style>
