<script lang="ts">
	import type { Flow, Issue } from '@arcflow/core';
	import Icon from './Icon.svelte';
	import { getEditor } from './context.svelte.js';
	import { format } from './options.js';

	let {
		flow,
		onapply,
		onclose
	}: {
		flow: Flow;
		onapply: (input: unknown) => Promise<{ loaded: boolean; issues: Issue[] }>;
		onclose: () => void;
	} = $props();

	const editor = getEditor();
	const labels = $derived(editor.labels);
	const readonly = $derived(editor.readonly);

	let text = $state('');
	let dirty = $state(false);
	let problems = $state<string[]>([]);
	let copied = $state<string | null>(null);

	$effect(() => {
		const json = JSON.stringify(flow, null, 2);
		if (!dirty) text = json;
	});

	async function apply() {
		let input: unknown;
		try {
			input = JSON.parse(text);
		} catch (error) {
			problems = [format(labels.notJson, { error: error instanceof Error ? error.message : String(error) })];
			return;
		}
		const result = await onapply(input);
		problems = result.issues.filter((issue) => issue.level === 'error').map((issue) => `${issue.path || 'flow'}: ${issue.message}`);
		if (result.loaded) dirty = false;
	}

	function revert() {
		dirty = false;
		problems = [];
	}

	async function copy(key: string, value: string) {
		try {
			await navigator.clipboard.writeText(value);
			copied = key;
			setTimeout(() => {
				if (copied === key) copied = null;
			}, 1800);
		} catch {
			problems = [labels.clipboardUnavailable];
		}
	}
</script>

<aside class="fb-inspector fb-json" aria-label={labels.json}>
	<div class="fb-json-head">
		<div class="fb-insp-titles">
			<span class="fb-eyebrow">{labels.flow}</span>
			<span class="fb-insp-title">{labels.json}</span>
		</div>
		<button class="fb-icon-btn" onclick={onclose} aria-label={labels.close}><Icon name="x" size={15} /></button>
	</div>
	<p class="fb-insp-desc">{labels.jsonHint}</p>

	<textarea
		class="fb-textarea mono fb-json-text"
		bind:value={text}
		spellcheck="false"
		{readonly}
		aria-label={labels.json}
		oninput={() => (dirty = true)}
	></textarea>

	{#if problems.length}
		<div class="fb-issues">
			{#each problems.slice(0, 8) as problem, i (i)}
				<div class="fb-issue error"><Icon name="alert" size={14} /><span>{problem}</span></div>
			{/each}
			{#if problems.length > 8}<span class="fb-help">+{problems.length - 8}</span>{/if}
		</div>
	{/if}

	{#if !readonly}
		<div class="fb-btn-row">
			<button class="fb-btn primary" disabled={!dirty} onclick={apply}>{labels.apply}</button>
			{#if dirty}<button class="fb-btn ghost" onclick={revert}>{labels.revert}</button>{/if}
		</div>
	{/if}

	<div class="fb-copy-list">
		<span class="fb-eyebrow">{labels.forTools}</span>
		<button class="fb-btn" onclick={() => copy('json', JSON.stringify(flow, null, 2))}>
			<Icon name={copied === 'json' ? 'check' : 'copy'} size={14} />{labels.copyJson}
		</button>
		<button class="fb-btn" onclick={() => copy('catalog', editor.registry.describe())}>
			<Icon name={copied === 'catalog' ? 'check' : 'copy'} size={14} />{labels.copyCatalog}
		</button>
		<button class="fb-btn" onclick={() => copy('schema', JSON.stringify(editor.registry.toJSONSchema(), null, 2))}>
			<Icon name={copied === 'schema' ? 'check' : 'copy'} size={14} />{labels.copySchema}
		</button>
	</div>
</aside>
