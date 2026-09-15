<script lang="ts">
	import { browser } from '$app/environment';
	import type { Flow } from '@arcflow/core';
	import type { UiOptions } from '@arcflow/editor/svelte';
	import { FlowEditor } from '@arcflow/editor/svelte';
	import { createTodoDigestFlow, standardRegistry } from '@arcflow/nodes';

	/** A real editor, running the standard steps in the page. */
	let {
		height = '560px',
		flow = createTodoDigestFlow(),
		readonly = false,
		ui = {},
		storageKey
	}: {
		height?: string;
		flow?: Flow;
		readonly?: boolean;
		ui?: UiOptions;
		storageKey?: string;
	} = $props();
</script>

<div class="demo" style:height>
	{#if browser}
		<FlowEditor steps={standardRegistry} {flow} {readonly} {ui} {storageKey} />
	{:else}
		<p class="placeholder">Loading the editor…</p>
	{/if}
</div>

<style>
	.demo {
		margin: 0 0 28px;
		border: 1px solid var(--line-strong);
		border-radius: 12px;
		overflow: hidden;
		background: var(--surface-2);
		box-shadow: 0 18px 50px rgb(0 0 0 / 0.08);
	}

	.placeholder {
		display: grid;
		place-items: center;
		height: 100%;
		margin: 0;
		color: var(--text-muted);
		font-size: 14px;
	}
</style>
