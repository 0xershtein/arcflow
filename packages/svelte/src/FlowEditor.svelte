<script lang="ts">
	import '@xyflow/svelte/dist/style.css';
	import './theme.css';
	import './editor.css';
	import { untrack, type Snippet } from 'svelte';
	import { SvelteFlowProvider } from '@xyflow/svelte';
	import type { Flow, Issue, Registry, RunEvent, Services } from '@arcflow/core';
	import Workspace from './Workspace.svelte';
	import { EditorState, setEditor } from './context.svelte.js';

	interface Props {
		/** Step types the editor offers. Build it with `createRegistry([...packs])`. */
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		registry: Registry<any>;
		/** Flow to show: JSON string, object, or builder output. Passing a different value reloads the canvas. */
		flow?: unknown;
		/** Persist edits to localStorage under this key (restored on the next visit). */
		storageKey?: string;
		/** Services handed to steps during Test run (which always uses `simulate` mode). */
		services?: Services;
		readonly?: boolean;
		/** Content for the left side of the top bar. */
		brand?: Snippet;
		/** Called with the flow JSON after every change (debounced). */
		onchange?: (flow: Flow) => void;
		/** Called for every Test run event. */
		onrun?: (event: RunEvent) => void;
	}

	let { registry, flow, storageKey, services, readonly = false, brand, onchange, onrun }: Props = $props();

	setEditor(new EditorState(untrack(() => registry)));

	let workspace = $state<ReturnType<typeof Workspace>>();

	/** The current flow as plain JSON. */
	export function getFlow(): Flow {
		return workspace!.getFlow();
	}

	/** Replaces the canvas with a flow and reports parse issues. */
	export function load(input: unknown): Promise<{ loaded: boolean; issues: Issue[] }> {
		return workspace!.load(input);
	}

	/** Starts a simulated run on the canvas, or stops the one in progress. */
	export function run(): Promise<void> {
		return workspace!.run();
	}
</script>

<SvelteFlowProvider>
	<Workspace bind:this={workspace} {flow} {storageKey} {services} {readonly} {brand} {onchange} {onrun} />
</SvelteFlowProvider>
