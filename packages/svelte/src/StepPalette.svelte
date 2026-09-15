<script lang="ts">
	import type { AnyNodeDefinition, Registry } from '@arcflow/core';
	import Icon from './Icon.svelte';
	import { DRAG_TYPE } from './context.svelte.js';

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let { registry, onadd }: { registry: Registry<any>; onadd: (kind: string) => void } = $props();

	let query = $state('');

	const groups = $derived.by(() => {
		const q = query.trim().toLowerCase();
		const defs = (registry.nodes as readonly AnyNodeDefinition[]).filter(
			(def) => !q || `${def.title} ${def.description} ${def.kind}`.toLowerCase().includes(q)
		);
		return (registry.categories as { id: string; label: string }[])
			.map((category) => ({ ...category, items: defs.filter((def) => (def.category ?? 'other') === category.id) }))
			.filter((group) => group.items.length > 0);
	});

	function startDrag(event: DragEvent, kind: string) {
		if (!event.dataTransfer) return;
		event.dataTransfer.setData(DRAG_TYPE, kind);
		event.dataTransfer.effectAllowed = 'move';
	}
</script>

<aside class="fb-palette" aria-label="Steps">
	<div class="fb-search">
		<Icon name="search" size={15} />
		<input class="fb-input" type="search" placeholder="Search steps" bind:value={query} />
	</div>

	<div class="fb-palette-list">
		{#each groups as group (group.id)}
			<div class="fb-group-label">{group.label}</div>
			{#each group.items as def (def.kind)}
				<button
					class="fb-item"
					draggable="true"
					title="Click to add, or drag onto the canvas"
					ondragstart={(event) => startDrag(event, def.kind)}
					onclick={() => onadd(def.kind)}
				>
					<span class="fb-node-icon"><Icon name={def.icon ?? 'sparkle'} size={15} /></span>
					<span class="fb-item-text">
						<span class="fb-item-title">{def.title}</span>
						<span class="fb-item-desc">{def.description}</span>
					</span>
				</button>
			{/each}
		{:else}
			<p class="fb-palette-empty">No steps match “{query}”.</p>
		{/each}
	</div>
</aside>
