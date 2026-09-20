<script lang="ts">
	import type { AnyNodeDefinition } from '@arcflow/core';
	import Icon from './Icon.svelte';
	import { DEFAULT_ICON } from './icons.js';
	import { getEditor } from './context.svelte.js';
	import { format } from './options.js';

	/** A searchable step list that pops up on the canvas. */
	let {
		x,
		y,
		title,
		triggers = false,
		onpick,
		onclose
	}: {
		x: number;
		y: number;
		title: string;
		/** Include trigger steps (only useful when the new step feeds into an existing one). */
		triggers?: boolean;
		onpick: (kind: string) => void;
		onclose: () => void;
	} = $props();

	const editor = getEditor();
	const labels = $derived(editor.labels);
	let query = $state('');
	let active = $state(0);
	let element = $state<HTMLDivElement>();
	let input = $state<HTMLInputElement>();

	const items = $derived.by(() => {
		const q = query.trim().toLowerCase();
		const categories = editor.registry.categories as readonly { id: string }[];
		const order = (def: AnyNodeDefinition) => categories.findIndex((c) => c.id === (def.category ?? 'other'));
		// Title matches first, then kind, then description.
		const rank = (def: AnyNodeDefinition) => {
			if (!q) return 0;
			const title = def.title.toLowerCase();
			if (title.startsWith(q)) return 0;
			if (title.includes(q)) return 1;
			if (def.kind.toLowerCase().includes(q)) return 2;
			return def.description.toLowerCase().includes(q) ? 3 : -1;
		};
		return (editor.registry.nodes as readonly AnyNodeDefinition[])
			.filter((def) => (triggers || !def.trigger) && rank(def) >= 0)
			.sort((a, b) => rank(a) - rank(b) || order(a) - order(b));
	});

	$effect(() => {
		input?.focus();
	});

	$effect(() => {
		void query;
		active = 0;
	});

	function onkeydown(event: KeyboardEvent) {
		if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
			event.preventDefault();
			const step = event.key === 'ArrowDown' ? 1 : -1;
			active = (active + step + items.length) % Math.max(items.length, 1);
			element?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
		} else if (event.key === 'Enter' && items[active]) {
			event.preventDefault();
			onpick(items[active].kind);
		} else if (event.key === 'Escape') {
			event.preventDefault();
			onclose();
		}
	}

	function onpointerdown(event: PointerEvent) {
		if (element && !element.contains(event.target as Node)) onclose();
	}
</script>

<svelte:window {onpointerdown} />

<div class="fb-picker" bind:this={element} style:left="{x}px" style:top="{y}px" role="dialog" aria-label={title}>
	<div class="fb-picker-head">{title}</div>
	<div class="fb-search">
		<Icon name="search" size={15} />
		<input bind:this={input} class="fb-input" type="search" placeholder={labels.searchSteps} bind:value={query} {onkeydown} />
	</div>
	<div class="fb-picker-list">
		{#each items as def, index (def.kind)}
			<button
				class="fb-item"
				class:is-active={index === active}
				type="button"
				data-index={index}
				onpointerenter={() => (active = index)}
				onclick={() => onpick(def.kind)}
			>
				<span class="fb-node-icon"><Icon name={def.icon ?? DEFAULT_ICON} size={15} /></span>
				<span class="fb-item-text">
					<span class="fb-item-title">{def.title}</span>
					<span class="fb-item-desc">{def.description}</span>
				</span>
			</button>
		{:else}
			<p class="fb-palette-empty">{format(labels.noStepsMatch, { query })}</p>
		{/each}
	</div>
</div>
