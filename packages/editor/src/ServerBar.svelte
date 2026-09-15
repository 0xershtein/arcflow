<script lang="ts">
	import Icon from './Icon.svelte';
	import type { ServerFlowSummary } from './backend.js';
	import { getEditor } from './context.svelte.js';
	import { format } from './options.js';

	/** Toolbar controls for server mode: the flow list, Save and Activate. */
	let {
		flows,
		current,
		dirty,
		busy,
		onopen,
		onnew,
		onsave,
		ontoggleActive,
		ondelete
	}: {
		flows: ServerFlowSummary[];
		current: ServerFlowSummary | null;
		dirty: boolean;
		busy: boolean;
		onopen: (id: string) => void;
		onnew: () => void;
		onsave: () => void;
		ontoggleActive: () => void;
		ondelete: (id: string) => void;
	} = $props();

	const editor = getEditor();
	const labels = $derived(editor.labels);
	const readonly = $derived(editor.readonly);
	let open = $state(false);
	let element = $state<HTMLDivElement>();

	const pick = (id: string) => {
		open = false;
		onopen(id);
	};
</script>

<svelte:window
	onpointerdown={(event) => {
		if (open && element && !element.contains(event.target as Node)) open = false;
	}}
/>

<div class="fb-server" bind:this={element}>
	<button class="fb-btn" onclick={() => (open = !open)} aria-expanded={open} aria-haspopup="menu">
		<Icon name="layers" size={15} />{current?.name ?? labels.flows}
		<Icon name="chevron" size={13} />
	</button>

	{#if open}
		<div class="fb-menu" role="menu">
			{#if !readonly}
				<button class="fb-menu-item" role="menuitem" onclick={() => ((open = false), onnew())}>
					<Icon name="plus" size={14} />{labels.newFlow}
				</button>
				<div class="fb-menu-line"></div>
			{/if}
			{#each flows as flow (flow.id)}
				<div class="fb-menu-row" class:is-on={flow.id === current?.id}>
					<button class="fb-menu-item" role="menuitem" onclick={() => pick(flow.id)}>
						<span class="fb-menu-dot" class:is-active={flow.active} title={flow.active ? labels.active : labels.paused}></span>
						<span class="fb-menu-name">{flow.name}</span>
						<span class="fb-menu-meta">{format(labels.versionLabel, { version: flow.version })}</span>
					</button>
					{#if !readonly}
						<button class="fb-icon-btn" aria-label="{labels.delete} {flow.name}" onclick={() => ondelete(flow.id)}>
							<Icon name="trash" size={13} />
						</button>
					{/if}
				</div>
			{:else}
				<p class="fb-menu-empty">{labels.noFlows}</p>
			{/each}
		</div>
	{/if}

	{#if !readonly}
		<button class="fb-btn" onclick={onsave} disabled={busy || (!dirty && Boolean(current))}>
			<Icon name="download" size={15} />{busy ? labels.saving : dirty || !current ? labels.save : labels.savedState}
		</button>
		{#if current}
			<button
				class="fb-btn"
				class:is-on={current.active}
				onclick={ontoggleActive}
				disabled={busy}
				title={labels.activeHint}
			>
				<Icon name={current.active ? 'stop' : 'check'} size={14} stroke={2} />{current.active ? labels.deactivate : labels.activate}
			</button>
		{/if}
	{/if}
</div>
