<script lang="ts">
	import { tick } from 'svelte';
	import { NodeResizer, useSvelteFlow, type NodeProps } from '@xyflow/svelte';
	import { getEditor } from './context.svelte.js';
	import type { CanvasNote } from './convert.js';

	let { id, data, selected }: NodeProps<CanvasNote> = $props();

	const editor = getEditor();
	const { updateNodeData } = useSvelteFlow();
	let editing = $state(false);
	let textarea = $state<HTMLTextAreaElement>();

	async function edit() {
		if (editor.readonly) return;
		editing = true;
		await tick();
		textarea?.focus();
	}

	$effect(() => {
		if (!data.editing) return;
		updateNodeData(id, { editing: false });
		edit();
	});
</script>

<NodeResizer minWidth={140} minHeight={70} isVisible={selected && !editor.readonly} handleClass="fb-note-handle" lineClass="fb-note-line" />
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="fb-note" class:selected ondblclick={edit}>
	{#if editing}
		<textarea
			bind:this={textarea}
			class="fb-note-text nodrag nowheel"
			value={data.text}
			placeholder={editor.labels.notePlaceholder}
			spellcheck="false"
			oninput={(event) => updateNodeData(id, { text: event.currentTarget.value })}
			onblur={() => (editing = false)}
			onkeydown={(event) => event.key === 'Escape' && event.currentTarget.blur()}
		></textarea>
	{:else}
		<div class="fb-note-text" class:is-empty={!data.text}>{data.text || editor.labels.notePlaceholder}</div>
	{/if}
</div>
