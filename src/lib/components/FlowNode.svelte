<script lang="ts">
	import { Handle, Position, type NodeProps } from '@xyflow/svelte';
	import Icon from './Icon.svelte';
	import { getBuilder } from '../flow/state.svelte';
	import type { FlowNode } from '../flow/types';

	let { id, data, selected }: NodeProps<FlowNode> = $props();

	const builder = getBuilder();
	const def = $derived(builder.registry.get(data.kind));
	const outputs = $derived(def ? builder.registry.outputsOf(def) : []);
	const labeledPorts = $derived(outputs.length > 1 || Boolean(outputs[0]?.label));
	const category = $derived(builder.registry.categories.find((c) => c.id === def?.category)?.label ?? 'Unknown');
	const run = $derived(builder.runStatus[id]);
	const hasError = $derived((builder.issuesByNode[id] ?? []).some((i) => i.level === 'error'));
	const summary = $derived.by(() => {
		try {
			return def?.summary?.(data.config) ?? def?.description ?? '';
		} catch {
			return '';
		}
	});
</script>

<div class="fb-node" class:selected class:has-error={hasError} data-run={run?.status}>
	{#if def && !def.trigger}
		<Handle type="target" position={Position.Left} id="in" class="fb-handle" />
	{/if}

	<div class="fb-node-head">
		<span class="fb-node-icon"><Icon name={def?.icon ?? 'alert'} size={15} /></span>
		<span class="fb-node-kind">{def?.trigger ? 'Trigger' : category}</span>
		<span class="fb-node-state">
			{#if run?.status === 'success'}
				<Icon name="check" size={14} stroke={2.2} />
			{:else if run?.status === 'error'}
				<Icon name="x" size={14} stroke={2.2} />
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
