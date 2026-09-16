<script lang="ts">
	import { Handle, Position, type NodeProps } from '@xyflow/svelte';
	import Icon from './Icon.svelte';
	import { getEditor } from './context.svelte.js';
	import type { CanvasNode } from './convert.js';
	import { format } from './options.js';

	let { id, data, selected }: NodeProps<CanvasNode> = $props();

	const editor = getEditor();
	const labels = $derived(editor.labels);
	/** `card`, `tile` or `compact` — see the `ui.node` option. */
	const shape = $derived(editor.ui.node);
	const def = $derived(editor.registry.get(data.kind));
	const outputs = $derived<{ id: string; label?: string }[]>(def?.outputs ?? []);
	const labeledPorts = $derived(outputs.length > 1 || Boolean(outputs[0]?.label));
	const category = $derived(
		def?.trigger
			? labels.trigger
			: ((editor.registry.categories as { id: string; label: string }[]).find((c) => c.id === (def?.category ?? 'other'))?.label ?? '')
	);
	const run = $derived(editor.runStatus[id]);
	const hasError = $derived((editor.issuesByNode[id] ?? []).some((issue) => issue.level === 'error'));
	const title = $derived(data.label || def?.title || data.kind);
	const summary = $derived.by(() => {
		if (!def) return format(labels.unknownStep, { kind: data.kind });
		try {
			return def.summary?.(data.config) ?? def.description;
		} catch {
			return def.description;
		}
	});
</script>

{#snippet state()}
	<span class="fb-node-state">
		{#if run?.status === 'success'}
			<Icon name="check" size={14} stroke={2.2} />
		{:else if run?.status === 'error'}
			<Icon name="x" size={14} stroke={2.2} />
		{:else if run?.status === 'waiting'}
			<Icon name="hourglass" size={14} />
		{:else if run?.status === 'running'}
			<span class="fb-spinner"></span>
		{:else if hasError}
			<span class="fb-dot-error" title={labels.needsAttention}></span>
		{/if}
	</span>
{/snippet}

<!-- The name and what the step will do: inside the box on a card, under it on a tile. -->
{#snippet identity()}
	<div class="fb-node-title">{title}</div>
	{#if shape !== 'compact'}
		<div class="fb-node-summary" class:is-run={Boolean(run?.message)}>{run?.message ?? summary}</div>
	{/if}
{/snippet}

<div class="fb-node" data-shape={shape} class:selected class:has-error={hasError} class:is-disabled={data.disabled} data-run={run?.status}>
	<div class="fb-node-box">
		{#if !def?.trigger}
			<Handle type="target" position={Position.Left} id="in" class="fb-handle" />
		{/if}

		{#if shape === 'tile'}
			<span class="fb-node-icon"><Icon name={def?.icon ?? 'alert'} size={26} /></span>
			{@render state()}
		{:else}
			<div class="fb-node-head">
				<span class="fb-node-icon"><Icon name={def?.icon ?? 'alert'} size={15} /></span>
				{#if shape === 'card'}<span class="fb-node-kind">{category}</span>{/if}
				{#if shape === 'compact'}{@render identity()}{/if}
				{@render state()}
			</div>
			{#if shape === 'card'}{@render identity()}{/if}
		{/if}

		{#if labeledPorts}
			<div class="fb-node-ports">
				{#each outputs as port (port.id)}
					<div class="fb-port-row">
						<span>{port.label ?? port.id}</span>
						<Handle type="source" position={Position.Right} id={port.id} class="fb-handle" />
					</div>
				{/each}
			</div>
		{:else if outputs.length}
			<Handle type="source" position={Position.Right} id={outputs[0].id} class="fb-handle" />
		{/if}
	</div>

	{#if shape === 'tile'}
		<div class="fb-node-caption">{@render identity()}</div>
	{/if}
</div>
