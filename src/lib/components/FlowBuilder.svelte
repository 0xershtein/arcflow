<script lang="ts">
	import '@xyflow/svelte/dist/style.css';
	import '../flow/theme.css';
	import { untrack, type Snippet } from 'svelte';
	import { SvelteFlowProvider } from '@xyflow/svelte';
	import Editor from './Editor.svelte';
	import { BuilderState, setBuilder } from '../flow/state.svelte';
	import type { Registry } from '../flow/registry';
	import type { FlowDocument } from '../flow/types';

	let {
		registry,
		initial,
		storageKey,
		brand
	}: {
		/** Node definitions the editor can use. Build it with `createRegistry([...packs])`. */
		registry: Registry;
		/** Flow shown on first load and on Reset. */
		initial: FlowDocument;
		/** When set, edits are saved to localStorage under this key. */
		storageKey?: string;
		/** Optional content for the left of the top bar (logo, product name). */
		brand?: Snippet;
	} = $props();

	setBuilder(new BuilderState(untrack(() => registry)));
</script>

<SvelteFlowProvider>
	<Editor {initial} {storageKey} {brand} />
</SvelteFlowProvider>
