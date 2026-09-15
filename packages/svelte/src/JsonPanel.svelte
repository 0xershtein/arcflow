<script lang="ts">
	import type { Flow, Issue, Registry } from '@arcflow/core';
	import Icon from './Icon.svelte';

	let {
		flow,
		registry,
		readonly = false,
		onapply,
		onclose
	}: {
		flow: Flow;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		registry: Registry<any>;
		readonly?: boolean;
		onapply: (input: unknown) => Promise<{ loaded: boolean; issues: Issue[] }>;
		onclose: () => void;
	} = $props();

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
			problems = [`Not valid JSON: ${error instanceof Error ? error.message : String(error)}`];
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

	async function copy(label: string, value: string) {
		try {
			await navigator.clipboard.writeText(value);
			copied = label;
			setTimeout(() => {
				if (copied === label) copied = null;
			}, 1800);
		} catch {
			problems = ['The clipboard is not available here.'];
		}
	}
</script>

<aside class="fb-inspector fb-json" aria-label="Flow JSON">
	<div class="fb-json-head">
		<div class="fb-insp-titles">
			<span class="fb-eyebrow">Flow</span>
			<span class="fb-insp-title">JSON</span>
		</div>
		<button class="fb-icon-btn" onclick={onclose} aria-label="Close JSON"><Icon name="x" size={15} /></button>
	</div>
	<p class="fb-insp-desc">Paste a flow from a file, your code, or an LLM and apply it. Positions are optional.</p>

	<textarea
		class="fb-textarea mono fb-json-text"
		bind:value={text}
		spellcheck="false"
		readonly={readonly}
		aria-label="Flow JSON"
		oninput={() => (dirty = true)}
	></textarea>

	{#if problems.length}
		<div class="fb-issues">
			{#each problems.slice(0, 8) as problem, i (i)}
				<div class="fb-issue error"><Icon name="alert" size={14} /><span>{problem}</span></div>
			{/each}
			{#if problems.length > 8}<span class="fb-help">…and {problems.length - 8} more</span>{/if}
		</div>
	{/if}

	{#if !readonly}
		<div class="fb-btn-row">
			<button class="fb-btn primary" disabled={!dirty} onclick={apply}>Apply</button>
			{#if dirty}<button class="fb-btn ghost" onclick={revert}>Revert</button>{/if}
		</div>
	{/if}

	<div class="fb-copy-list">
		<span class="fb-eyebrow">For code & AI tools</span>
		<button class="fb-btn" onclick={() => copy('json', JSON.stringify(flow, null, 2))}>
			<Icon name={copied === 'json' ? 'check' : 'copy'} size={14} />Copy flow JSON
		</button>
		<button class="fb-btn" onclick={() => copy('guide', registry.describe())}>
			<Icon name={copied === 'guide' ? 'check' : 'copy'} size={14} />Copy step catalog (for prompts)
		</button>
		<button class="fb-btn" onclick={() => copy('schema', JSON.stringify(registry.toJSONSchema(), null, 2))}>
			<Icon name={copied === 'schema' ? 'check' : 'copy'} size={14} />Copy JSON Schema
		</button>
	</div>
</aside>
