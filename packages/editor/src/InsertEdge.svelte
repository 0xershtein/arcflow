<script lang="ts">
	import { BaseEdge, EdgeLabel, getBezierPath, type EdgeProps } from '@xyflow/svelte';
	import Icon from './Icon.svelte';
	import { getEditor } from './context.svelte.js';

	/** A bezier connection with a "+" button in the middle for inserting a step. */
	let { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, style, selected }: EdgeProps = $props();

	const editor = getEditor();
	const [path, labelX, labelY] = $derived(getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition }));

	let hovered = $state(false);
	let timer: ReturnType<typeof setTimeout> | undefined;
	const enter = () => {
		clearTimeout(timer);
		hovered = true;
	};
	const leave = () => {
		clearTimeout(timer);
		timer = setTimeout(() => (hovered = false), 200);
	};
	$effect(() => () => clearTimeout(timer));
</script>

<BaseEdge {id} {path} {markerEnd} {style} onpointerenter={enter} onpointerleave={leave} />
{#if editor.onInsert && !editor.readonly && (hovered || selected)}
	<EdgeLabel x={labelX} y={labelY} transparent>
		<button
			class="fb-edge-add nodrag nopan"
			type="button"
			aria-label={editor.labels.insertStep}
			title={editor.labels.insertStep}
			onpointerenter={enter}
			onpointerleave={leave}
			onclick={(event) => {
				event.stopPropagation();
				editor.onInsert?.(id, event.clientX, event.clientY);
			}}
		>
			<Icon name="plus" size={12} stroke={2.4} />
		</button>
	</EdgeLabel>
{/if}
