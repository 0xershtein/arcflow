<script lang="ts">
	import Icon from './Icon.svelte';
	import { DRAG_TYPE } from '../flow/state.svelte';
	import type { Registry } from '../flow/registry';

	let { registry, onadd }: { registry: Registry; onadd: (kind: string) => void } = $props();

	let query = $state('');

	const groups = $derived.by(() => {
		const q = query.trim().toLowerCase();
		const defs = registry.all().filter((d) => !q || `${d.title} ${d.description}`.toLowerCase().includes(q));
		return registry.categories
			.map((category) => ({ ...category, items: defs.filter((d) => d.category === category.id) }))
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
					<span class="fb-node-icon"><Icon name={def.icon} size={15} /></span>
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
