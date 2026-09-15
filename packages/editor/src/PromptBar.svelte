<script lang="ts">
	import type { Issue } from '@arcflow/core';
	import Icon from './Icon.svelte';
	import { getEditor } from './context.svelte.js';
	import { format } from './options.js';

	/** Builds and changes the flow from a description, with the result kept or discarded. */
	let {
		mode,
		busy,
		problems = 0,
		suggestion,
		raised = false,
		canExplain = false,
		explaining = false,
		explanation = null,
		onsubmit,
		onkeep,
		ondiscard,
		onstop,
		onfix,
		onexplain,
		ondismiss
	}: {
		/** `create` starts from an empty canvas, `edit` changes what is there. */
		mode: 'create' | 'edit';
		busy: boolean;
		/** Errors on the canvas right now; with any, the bar offers to fix them. */
		problems?: number;
		/** The flow on the canvas is the model's; keep it or put the old one back. */
		suggestion: { changes: { type: string }[]; issues: Issue[]; attempts?: number; model?: string; built?: number } | null;
		/** Sits above the run log when it is open. */
		raised?: boolean;
		/** The backend can describe a flow in plain language. */
		canExplain?: boolean;
		explaining?: boolean;
		/** What the model said about this flow, shown above the bar until dismissed. */
		explanation?: string | null;
		onsubmit: (prompt: string) => void;
		onkeep: () => void;
		ondiscard: () => void;
		onstop: () => void;
		onfix: () => void;
		onexplain: () => void;
		ondismiss: () => void;
	} = $props();

	const editor = getEditor();
	const labels = $derived(editor.labels);
	let prompt = $state('');
	let input = $state<HTMLTextAreaElement>();

	const errors = $derived(suggestion?.issues.filter((issue) => issue.level === 'error').length ?? 0);
	const summary = $derived.by(() => {
		if (!suggestion) return '';
		// A new flow reports what it built; a change reports what moved.
		const what =
			suggestion.built !== undefined
				? format(labels.aiBuilt, { count: suggestion.built })
				: suggestion.changes.length
					? format(labels.aiChangeCount, { count: suggestion.changes.length })
					: labels.aiNoChanges;
		const tries = (suggestion.attempts ?? 1) > 1 ? ` · ${format(labels.aiFixed, { count: suggestion.attempts ?? 1 })}` : '';
		return `${what}${tries}`;
	});

	function send() {
		const text = prompt.trim();
		if (!text || busy) return;
		prompt = '';
		onsubmit(text);
	}

	function onkeydown(event: KeyboardEvent) {
		// Enter sends; Shift+Enter keeps writing. Stop the canvas shortcuts from seeing either.
		event.stopPropagation();
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			send();
		}
	}
</script>

<div class="fb-prompt-wrap" class:is-raised={raised}>
	{#if explanation}
		<div class="fb-explain" role="status">
			<p>{explanation}</p>
			<button class="fb-icon-btn" onclick={ondismiss} aria-label={labels.close}><Icon name="x" size={14} /></button>
		</div>
	{/if}

	<div class="fb-prompt">
	{#if suggestion}
		<span class="fb-prompt-icon"><Icon name="sparkle" size={15} /></span>
		<span class="fb-prompt-summary">
			{summary}
			{#if errors}<span class="fb-prompt-errors">{format(errors === 1 ? labels.problemCount : labels.problemsCount, { count: errors })}</span>{/if}
		</span>
		<button class="fb-btn ghost" onclick={ondiscard}><Icon name="undo" size={14} />{labels.aiDiscard}</button>
		<button class="fb-btn primary" onclick={onkeep}><Icon name="check" size={14} stroke={2.2} />{labels.aiKeep}</button>
	{:else}
		<span class="fb-prompt-icon" class:is-busy={busy}>
			{#if busy}<span class="fb-spinner"></span>{:else}<Icon name="sparkle" size={15} />{/if}
		</span>
		<textarea
			bind:this={input}
			class="fb-prompt-input"
			rows="1"
			placeholder={mode === 'edit' ? labels.aiEditPlaceholder : labels.aiPlaceholder}
			bind:value={prompt}
			disabled={busy}
			spellcheck="false"
			{onkeydown}
		></textarea>
		{#if busy}
			<span class="fb-prompt-busy">{labels.aiWorking}</span>
			<button class="fb-btn ghost" onclick={onstop}><Icon name="stop" size={13} />{labels.aiStop}</button>
		{:else}
			{#if problems > 0 && mode === 'edit' && !prompt.trim()}
				<button class="fb-btn" onclick={onfix}><Icon name="alert" size={13} />{labels.aiFix}</button>
			{:else if canExplain && mode === 'edit' && !prompt.trim()}
				<button class="fb-btn" onclick={onexplain} disabled={explaining}>
					<Icon name="sparkle" size={13} />{explaining ? labels.aiExplaining : labels.aiExplain}
				</button>
			{/if}
			<button class="fb-btn primary" onclick={send} disabled={!prompt.trim()}>{labels.askAi}</button>
		{/if}
	{/if}
	</div>
</div>
