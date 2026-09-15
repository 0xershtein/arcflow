<script lang="ts">
	import type { AnyNodeDefinition } from '@arcflow/core';
	import Icon from './Icon.svelte';
	import { DRAG_TYPE, getEditor } from './context.svelte.js';
	import { format } from './options.js';

	let { onadd }: { onadd: (kind: string) => void } = $props();

	const editor = getEditor();
	const labels = $derived(editor.labels);
	let query = $state('');

	const groups = $derived.by(() => {
		const q = query.trim().toLowerCase();
		const defs = (editor.registry.nodes as readonly AnyNodeDefinition[]).filter(
			(def) => !q || `${def.title} ${def.description} ${def.kind}`.toLowerCase().includes(q)
		);
		return (editor.registry.categories as { id: string; label: string }[])
			.map((category) => ({ ...category, items: defs.filter((def) => (def.category ?? 'other') === category.id) }))
			.filter((group) => group.items.length > 0);
	});

	function startDrag(event: DragEvent, kind: string) {
		if (!event.dataTransfer) return;
		event.dataTransfer.setData(DRAG_TYPE, kind);
		event.dataTransfer.effectAllowed = 'move';
	}
</script>

<aside class="fb-palette" aria-label={labels.searchSteps}>
	<div class="fb-search">
		<Icon name="search" size={15} />
		<input class="fb-input" type="search" placeholder={labels.searchSteps} bind:value={query} />
	</div>

	<div class="fb-palette-list">
		{#each groups as group (group.id)}
			<div class="fb-group-label">{group.label}</div>
			{#each group.items as def (def.kind)}
				<button
					class="fb-item"
					draggable="true"
					title={labels.addStepHint}
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
			<p class="fb-palette-empty">{format(labels.noStepsMatch, { query })}</p>
		{/each}
	</div>
</aside>
