<script lang="ts">
	import Icon from './Icon.svelte';
	import type { ServerRunSummary } from './backend.js';
	import { getEditor } from './context.svelte.js';
	import { format } from './options.js';

	/** Run history for the open flow, with the run being viewed highlighted. */
	let {
		runs,
		selectedId,
		onopen,
		onclose,
		onrefresh,
		oncancel
	}: {
		runs: ServerRunSummary[];
		selectedId: string | null;
		onopen: (id: string) => void;
		onclose: () => void;
		onrefresh: () => void;
		oncancel: (id: string) => void;
	} = $props();

	const editor = getEditor();
	const labels = $derived(editor.labels);

	const statusLabel = (status: ServerRunSummary['status']) =>
		status === 'completed'
			? labels.completed
			: status === 'failed'
				? labels.failed
				: status === 'waiting'
					? labels.waiting
					: status === 'cancelled'
						? labels.stopped
						: labels.running;

	const time = (at: number) => new Date(at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
	const took = (run: ServerRunSummary) => Math.max(0, Math.round(((run.finishedAt ?? run.updatedAt) - run.startedAt) / 100) / 10);
</script>

<section class="fb-runs" aria-label={labels.executions}>
	<div class="fb-runs-head">
		<span>{labels.executions}</span>
		<button class="fb-icon-btn" onclick={onrefresh} aria-label={labels.executions}><Icon name="repeat" size={14} /></button>
		<button class="fb-icon-btn" onclick={onclose} aria-label={labels.close}><Icon name="x" size={15} /></button>
	</div>
	<div class="fb-runs-list">
		{#each runs as run (run.id)}
			<div class="fb-run-row" class:is-on={run.id === selectedId}>
				<button class="fb-run-open" onclick={() => onopen(run.id)} title={run.error ?? labels.openExecution}>
					<span class="fb-badge" class:ok={run.status === 'completed'} class:bad={run.status === 'failed'}>{statusLabel(run.status)}</span>
					<span class="fb-run-time">{time(run.startedAt)}</span>
					<span class="fb-run-meta">{run.trigger.type} · {took(run)}s</span>
				</button>
				{#if run.status === 'running' || run.status === 'waiting'}
					<button class="fb-icon-btn" onclick={() => oncancel(run.id)} aria-label={labels.cancelRun}><Icon name="stop" size={13} /></button>
				{/if}
			</div>
		{:else}
			<p class="fb-runs-empty">{labels.noExecutions}</p>
		{/each}
	</div>
	{#if selectedId}
		<button class="fb-btn ghost fb-runs-back" onclick={() => onopen('')}>
			<Icon name="reply" size={14} />{labels.backToEditing}
		</button>
		<span class="fb-runs-note">{format(labels.viewingRun, { id: selectedId.slice(0, 8) })}</span>
	{/if}
</section>
