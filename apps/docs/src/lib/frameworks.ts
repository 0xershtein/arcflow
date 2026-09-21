/**
 * Mounting the editor, one snippet per framework. Shared by the pages that show it
 * so a reader meets the same code in the quick start and in the editor reference.
 *
 * Each is a whole component, not a sketch: it creates the editor once, pushes later
 * changes through `setOptions`, and destroys it on unmount.
 */
export interface FrameworkSnippet {
	id: string;
	label: string;
	language: string;
	code: string;
}

const html = `<div id="editor" style="height: 100dvh"></div>

<script type="module">
	import { createEditor } from '@arcsig-labs/editor';
	import { standardSteps } from '@arcsig-labs/nodes';

	const editor = createEditor('#editor', {
		steps: [standardSteps],
		theme: 'auto',
		onChange: (flow) => localStorage.setItem('flow', JSON.stringify(flow))
	});
<\/script>`;

const svelte = `<script lang="ts">
	import { FlowEditor } from '@arcsig-labs/editor/svelte';
	import { standardRegistry } from '@arcsig-labs/nodes';

	let { flow, save }: { flow?: unknown; save: (next: unknown) => void } = $props();
<\/script>

<div style="height: 100dvh">
	<FlowEditor steps={standardRegistry} {flow} theme="auto" onChange={save} />
</div>`;

const react = `import { useEffect, useRef } from 'react';
import { createEditor, type EditorInstance, type EditorOptions } from '@arcsig-labs/editor';

export function FlowEditor({ steps, className, ...options }: EditorOptions & { className?: string }) {
	const host = useRef<HTMLDivElement>(null);
	const editor = useRef<EditorInstance | null>(null);

	// Mounted once. Development mounts effects twice, so the cleanup has to destroy the
	// instance rather than leave a second canvas behind.
	useEffect(() => {
		const instance = createEditor(host.current!, { steps, ...options });
		editor.current = instance;
		return () => {
			instance.destroy();
			editor.current = null;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [steps]);

	// Theme, labels, readonly, callbacks and the flow can all change while it runs.
	useEffect(() => {
		editor.current?.setOptions(options);
	});

	return <div ref={host} className={className} style={{ height: '100dvh' }} />;
}

// A new flow object means a new flow, so hold it still:
//   const flow = useMemo(() => createPayrollFlow(), []);`;

const vue = `<script setup lang="ts">
import { onBeforeUnmount, onMounted, useTemplateRef, watchEffect } from 'vue';
import { createEditor, type EditorInstance, type EditorOptions } from '@arcsig-labs/editor';

const props = defineProps<{ steps: EditorOptions['steps']; flow?: EditorOptions['flow']; readonly?: boolean }>();
const emit = defineEmits<{ change: [unknown] }>();

const host = useTemplateRef<HTMLDivElement>('host');
let editor: EditorInstance | undefined;

onMounted(() => {
	editor = createEditor(host.value!, {
		steps: props.steps,
		flow: props.flow,
		readonly: props.readonly,
		onChange: (flow) => emit('change', flow)
	});
});

// Reactive props are pushed in; the steps are fixed for the life of the editor.
watchEffect(() => editor?.setOptions({ flow: props.flow, readonly: props.readonly }));

onBeforeUnmount(() => editor?.destroy());
<\/script>

<template>
	<div ref="host" style="height: 100dvh" />
</template>`;

export const mounting: FrameworkSnippet[] = [
	{ id: 'html', label: 'HTML', language: 'html', code: html },
	{ id: 'react', label: 'React', language: 'tsx', code: react },
	{ id: 'vue', label: 'Vue', language: 'vue', code: vue },
	{ id: 'svelte', label: 'Svelte', language: 'svelte', code: svelte }
];
