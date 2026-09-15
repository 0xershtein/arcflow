<script lang="ts">
	import { Handle, Position, type NodeProps } from '@xyflow/svelte';
	import Icon from './Icon.svelte';
	import { getEditor } from './context.svelte.js';
	import type { CanvasNode } from './convert.js';

	let { id, data, selected }: NodeProps<CanvasNode> = $props();

	const editor = getEditor();
	const def = $derived(editor.registry.get(data.kind));
	const outputs = $derived<{ id: string; label?: string }[]>(def?.outputs ?? []);
	const labeledPorts = $derived(outputs.length > 1 || Boolean(outputs[0]?.label));
	const category = $derived(
		def?.trigger ? 'Trigger' : (editor.registry.categories.find((c: { id: string }) => c.id === (def?.category ?? 'other'))?.label ?? 'Unknown')
	);
	const run = $derived(editor.runStatus[id]);
	const hasError = $derived((editor.issuesByNode[id] ?? []).some((issue) => issue.level === 'error'));
	const summary = $derived.by(() => {
		if (!def) return `Unknown step type “${data.kind}”`;
		try {
			return def.summary?.(data.config) ?? def.description;
		} catch {
			return def.description;
		}
	});
</script>

<div class="fb-node" class:selected class:has-error={hasError} class:is-disabled={data.disabled} data-run={run?.status}>
	{#if !def?.trigger}
		<Handle type="target" position={Position.Left} id="in" class="fb-handle" />
	{/if}

	<div class="fb-node-head">
		<span class="fb-node-icon"><Icon name={def?.icon ?? 'alert'} size={15} /></span>
		<span class="fb-node-kind">{category}</span>
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
				<span class="fb-dot-error" title="Needs attention"></span>
			{/if}
		</span>
	</div>

	<div class="fb-node-title">{data.label || def?.title || data.kind}</div>
	<div class="fb-node-summary" class:is-run={Boolean(run?.message)}>{run?.message ?? summary}</div>

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
