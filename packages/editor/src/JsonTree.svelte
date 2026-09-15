<script lang="ts">
	import Icon from './Icon.svelte';
	import JsonTree from './JsonTree.svelte';
	import { EXPRESSION_DRAG } from './context.svelte.js';

	/** Collapsible view of a JSON value. Rows with a path can be dragged onto fields as `{{ path }}`. */
	let {
		value,
		path,
		label,
		depth = 0
	}: {
		value: unknown;
		/** Expression path of this value, e.g. `steps.fetch.output.body`. Empty when it cannot be addressed. */
		path: string;
		label?: string;
		depth?: number;
	} = $props();

	const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
	const LIMIT = 100;

	let open = $state(untrackDepth());
	function untrackDepth() {
		return depth < 1;
	}

	const isContainer = $derived(value !== null && typeof value === 'object');
	const entries = $derived.by((): [string, unknown, string][] => {
		if (!isContainer) return [];
		if (Array.isArray(value)) return value.map((item, index) => [String(index), item, path ? `${path}[${index}]` : '']);
		return Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, item, path && IDENTIFIER.test(key) ? `${path}.${key}` : '']);
	});

	const summary = $derived.by(() => {
		if (value === undefined) return 'undefined';
		if (value === null) return 'null';
		if (Array.isArray(value)) return `[${value.length}]`;
		if (typeof value === 'object') return `{${Object.keys(value).length}}`;
		if (typeof value === 'string') return JSON.stringify(value.length > 80 ? `${value.slice(0, 80)}…` : value);
		return String(value);
	});

	const type = $derived(value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value);

	function startDrag(event: DragEvent) {
		if (!path || !event.dataTransfer) return;
		event.dataTransfer.setData(EXPRESSION_DRAG, `{{ ${path} }}`);
		event.dataTransfer.setData('text/plain', `{{ ${path} }}`);
		event.dataTransfer.effectAllowed = 'copy';
	}
</script>

<div
	class="fb-tree-row"
	class:is-draggable={Boolean(path)}
	style:padding-left="{depth * 14}px"
	draggable={Boolean(path)}
	title={path ? `{{ ${path} }}` : undefined}
	ondragstart={startDrag}
	role="treeitem"
	tabindex="-1"
	aria-expanded={isContainer ? open : undefined}
	aria-selected="false"
>
	{#if isContainer}
		<button class="fb-tree-toggle" class:is-open={open} type="button" aria-label={open ? 'Collapse' : 'Expand'} onclick={() => (open = !open)}>
			<Icon name="chevron" size={12} stroke={2} />
		</button>
	{:else}
		<span class="fb-tree-spacer"></span>
	{/if}
	{#if label !== undefined}<span class="fb-tree-key">{label}</span>{/if}
	<span class="fb-tree-value is-{type}">{summary}</span>
</div>

{#if isContainer && open}
	{#each entries.slice(0, LIMIT) as [key, child, childPath] (key)}
		<JsonTree value={child} path={childPath} label={key} depth={depth + 1} />
	{/each}
	{#if entries.length > LIMIT}
		<div class="fb-tree-more" style:padding-left="{(depth + 1) * 14 + 18}px">+{entries.length - LIMIT}</div>
	{/if}
{/if}
