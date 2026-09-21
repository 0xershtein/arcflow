<script lang="ts">
	import { browser } from '$app/environment';
	import { FlowEditor } from '@arcsig-labs/editor/svelte';
	import { standardRegistry } from '@arcsig-labs/nodes';
	import { createDemoFlow } from './demo-flow';

	/**
	 * A host header above an editor whose toolbar is down to the 40px strip. The host's own
	 * button calls `run()`: hiding the Test run button never disables running.
	 */
	const flow = createDemoFlow();
	let editor = $state<ReturnType<typeof FlowEditor>>();
	let name = $state(flow.name);
</script>

<div class="host">
	<header>
		<span class="title">{name}</span>
		<span class="spacer"></span>
		<button type="button" onclick={() => editor?.run()} disabled={!editor}>Test run</button>
	</header>
	<div class="canvas">
		{#if browser}
			<FlowEditor
				bind:this={editor}
				steps={standardRegistry}
				{flow}
				ui={{ toolbar: { name: false, json: false, importExport: false, flows: false, executions: false, run: false, testRun: false }, palette: false }}
				onChange={(next) => (name = next.name)}
			/>
		{:else}
			<p class="placeholder">Loading the editor…</p>
		{/if}
	</div>
</div>

<style>
	.host {
		display: flex;
		flex-direction: column;
		height: 460px;
		margin: 0 0 16px;
		border: 1px solid var(--line-strong);
		border-radius: 12px;
		overflow: hidden;
		background: var(--bg);
	}

	header {
		display: flex;
		align-items: center;
		gap: 10px;
		height: 52px;
		padding: 0 14px;
		border-bottom: 1px solid var(--line);
	}

	.title {
		overflow: hidden;
		color: var(--text);
		font-size: 15px;
		font-weight: 600;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.spacer {
		flex: 1;
	}

	button {
		flex: none;
		height: 32px;
		padding: 0 14px;
		border: 1px solid var(--accent);
		border-radius: 7px;
		background: var(--accent);
		color: var(--accent-ink);
		font: inherit;
		font-size: 14px;
		font-weight: 550;
		cursor: pointer;
		transition: filter 0.18s cubic-bezier(0.16, 1, 0.3, 1);
	}

	button:hover {
		filter: brightness(1.08);
	}

	/* A flex child needs min-height: 0, or the editor grows instead of filling its share. */
	.canvas {
		flex: 1;
		min-height: 0;
		background: var(--surface-2);
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
