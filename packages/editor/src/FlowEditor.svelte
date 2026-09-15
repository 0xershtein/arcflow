<script lang="ts">
	import { untrack, type Snippet } from 'svelte';
	import { SvelteFlowProvider } from '@xyflow/svelte';
	import type { Flow, Issue } from '@arcflow/core';
	import Workspace from './Workspace.svelte';
	import { EditorState, setEditor } from './context.svelte.js';
	import { resolveLabels, resolveRegistry, resolveTheme, resolveUi, type EditorOptions } from './options.js';

	interface Props extends EditorOptions {
		/** Content for the left side of the toolbar (Svelte only). */
		brand?: Snippet;
	}

	let {
		steps,
		flow,
		theme,
		ui,
		backend,
		labels,
		readonly = false,
		storageKey,
		services,
		runStepDelay = 450,
		onChange,
		onValidate,
		onSelect,
		onRun,
		brand
	}: Props = $props();

	const editor = untrack(() => new EditorState(resolveRegistry(steps), resolveLabels(labels), resolveUi(ui), readonly));
	setEditor(editor);

	$effect.pre(() => {
		editor.labels = resolveLabels(labels);
		editor.ui = resolveUi(ui);
		editor.readonly = readonly;
		editor.backend = backend ?? null;
	});

	const darkQuery = typeof window !== 'undefined' ? window.matchMedia?.('(prefers-color-scheme: dark)') : undefined;
	let prefersDark = $state(darkQuery?.matches ?? false);
	$effect(() => {
		if (!darkQuery) return;
		const update = () => (prefersDark = darkQuery.matches);
		darkQuery.addEventListener('change', update);
		return () => darkQuery.removeEventListener('change', update);
	});

	const resolved = $derived(resolveTheme(theme, prefersDark));

	let workspace = $state<ReturnType<typeof Workspace>>();

	/** The current flow as plain JSON. */
	export function getFlow(): Flow {
		return workspace!.getFlow();
	}

	/** Current problems (errors and warnings). */
	export function getIssues(): Issue[] {
		return workspace!.getIssues();
	}

	/** Replaces the canvas with a flow and reports parse issues. */
	export function load(input: unknown): Promise<{ loaded: boolean; issues: Issue[] }> {
		return workspace!.load(input);
	}

	/** Reverts the last change. */
	export function undo() {
		workspace!.undo();
	}

	/** Re-applies the last undone change. */
	export function redo() {
		workspace!.redo();
	}

	/** Starts a simulated run on the canvas, or stops the one in progress. */
	export function run(): Promise<void> {
		return workspace!.run();
	}

	/** Server mode: saves the flow and runs it for real, or cancels the run in progress. */
	export function runOnServer(): Promise<void> {
		return workspace!.runOnServer();
	}
</script>

<SvelteFlowProvider>
	<Workspace
		bind:this={workspace}
		{flow}
		{storageKey}
		{services}
		{runStepDelay}
		themeStyle={resolved.style}
		themeMode={resolved.mode}
		nodeWidth={resolved.nodeWidth}
		{brand}
		{onChange}
		{onValidate}
		{onSelect}
		{onRun}
	/>
</SvelteFlowProvider>
