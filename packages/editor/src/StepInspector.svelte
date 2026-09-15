<script lang="ts">
	import { fieldLabel, isFieldVisible, resolveTemplates, type AnyNodeDefinition, type Issue, type Shape, type StepRecord } from '@arcflow/core';
	import FieldInput from './FieldInput.svelte';
	import Icon from './Icon.svelte';
	import JsonTree from './JsonTree.svelte';
	import { getEditor, type Suggestion } from './context.svelte.js';
	import type { CanvasNode } from './convert.js';
	import { format } from './options.js';

	let {
		node,
		issues,
		upstream = [],
		onconfig,
		onlabel,
		ontoggle,
		ondelete,
		onduplicate,
		onfocus,
		onrun
	}: {
		node: CanvasNode | null;
		issues: Issue[];
		/** Steps that run before this one, nearest first. */
		upstream?: { id: string; title: string }[];
		onconfig: (key: string, value: unknown) => void;
		onlabel: (label: string) => void;
		ontoggle: () => void;
		ondelete: () => void;
		onduplicate: () => void;
		onfocus: (nodeId: string) => void;
		onrun?: () => void;
	} = $props();

	type Tab = 'settings' | 'input' | 'output';
	const TABS: Tab[] = ['settings', 'input', 'output'];
	const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

	const editor = getEditor();
	const labels = $derived(editor.labels);
	const readonly = $derived(editor.readonly);

	let tab = $state<Tab>('settings');
	let iteration = $state(-1);
	let lastNodeId: string | undefined;
	$effect.pre(() => {
		if (node?.id === lastNodeId) return;
		lastNodeId = node?.id;
		iteration = -1;
		// A different step opens on its settings, not on the data of the one before it.
		tab = 'settings';
	});

	const def = $derived<AnyNodeDefinition | undefined>(node ? editor.registry.get(node.data.kind) : undefined);
	const category = $derived(
		def?.trigger ? labels.trigger : (editor.registry.categories as { id: string; label: string }[]).find((c) => c.id === (def?.category ?? 'other'))?.label
	);
	const fieldKey = (issue: Issue) => /\.config\.([^.[\]]+)/.exec(issue.path)?.[1];
	const nodeIssues = $derived(node ? issues.filter((issue) => issue.nodeId === node.id) : []);
	const fields = $derived(
		node && def ? Object.entries(def.config as Shape).filter(([, field]) => isFieldVisible(field, node.data.config, def.config)) : []
	);
	const otherIssues = $derived(nodeIssues.filter((issue) => !fields.some(([key]) => key === fieldKey(issue))));
	const withoutName = (message: string) => (node && def ? message.replace(`${node.data.label || def.title}: `, '') : message);

	// ---------- Run data ----------

	const records = $derived(
		node && editor.lastRun
			? Object.entries(editor.lastRun.steps).filter(([, step]) => step.nodeId === node.id && step.status !== 'skipped' && step.status !== 'pending')
			: []
	);
	const selectedRecord = $derived<[string, StepRecord] | undefined>(
		records.length ? records[iteration < 0 || iteration >= records.length ? records.length - 1 : iteration] : undefined
	);
	const record = $derived(selectedRecord?.[1]);
	const recordScope = $derived(selectedRecord && selectedRecord[0].includes('/') ? selectedRecord[0].slice(0, selectedRecord[0].lastIndexOf('/')) : '');

	function latestOutput(id: string): { ran: boolean; output?: unknown } {
		const run = editor.lastRun;
		if (!run) return { ran: false };
		const inScope = recordScope ? run.steps[`${recordScope}/${id}`] : undefined;
		const top = run.steps[id];
		const found =
			[inScope, top].find((step) => step && step.status === 'success') ??
			Object.entries(run.steps)
				.filter(([key, step]) => step.nodeId === id && key.includes('/') && step.status === 'success')
				.at(-1)?.[1];
		return found ? { ran: true, output: found.output } : { ran: false };
	}

	const upstreamData = $derived(upstream.map((step) => ({ ...step, ...latestOutput(step.id) })));

	const scope = $derived.by(() => {
		const run = editor.lastRun;
		if (!run) return null;
		const steps: Record<string, { status: string; output?: unknown }> = {};
		for (const [key, step] of Object.entries(run.steps)) {
			const stepScope = key.includes('/') ? key.slice(0, key.lastIndexOf('/')) : '';
			if (stepScope !== '' && stepScope !== recordScope) continue;
			if (step.status === 'success' || step.status === 'error' || step.status === 'waiting') steps[step.nodeId] = { status: step.status, output: step.output };
		}
		const iterationState = recordScope ? run.scopes[recordScope] : undefined;
		return {
			vars: run.vars,
			trigger: run.trigger,
			steps,
			input: record?.input,
			inputs: record?.inputs ?? {},
			run: { id: run.id, mode: run.mode },
			$item: iterationState?.item,
			$index: iterationState?.index,
			$now: new Date().toISOString()
		};
	});

	function describeValue(value: unknown) {
		if (value === undefined) return labels.notRunYet;
		if (value === null) return 'null';
		if (Array.isArray(value)) return `list · ${value.length}`;
		if (typeof value === 'object') return 'object';
		const text = JSON.stringify(value);
		return text.length > 28 ? `${text.slice(0, 28)}…` : text;
	}

	const suggestions = $derived.by(() => {
		const found: Suggestion[] = [];
		const seen = new Set<string>();
		const push = (path: string, detail: string) => {
			if (seen.has(path) || found.length > 400) return;
			seen.add(path);
			found.push({ path, detail });
		};
		const walk = (path: string, value: unknown, depth = 0) => {
			push(path, describeValue(value));
			if (depth >= 4 || value === null || typeof value !== 'object') return;
			if (Array.isArray(value)) {
				value.slice(0, 3).forEach((item, index) => walk(`${path}[${index}]`, item, depth + 1));
			} else {
				for (const [key, item] of Object.entries(value).slice(0, 50)) if (IDENTIFIER.test(key)) walk(`${path}.${key}`, item, depth + 1);
			}
		};
		walk('input', record?.input);
		push('steps', 'earlier steps');
		for (const step of upstreamData) {
			push(`steps.${step.id}`, step.title);
			walk(`steps.${step.id}.output`, step.output);
		}
		walk('trigger', editor.lastRun?.trigger);
		walk('vars', editor.lastRun?.vars ?? editor.registry.sampleVars);
		push('$now', 'current time');
		push('$item', 'item in a loop');
		push('$index', 'index in a loop');
		return found;
	});

	function previewOf(value: unknown): { text: string; error?: boolean } | null {
		if (value === undefined || !JSON.stringify(value).includes('{{')) return null;
		if (!scope) return { text: labels.previewNeedsRun };
		try {
			const resolved = resolveTemplates(value, scope);
			const text = typeof resolved === 'string' ? resolved : resolved === undefined ? 'undefined' : JSON.stringify(resolved);
			return { text: text.length > 160 ? `${text.slice(0, 160)}…` : text };
		} catch (error) {
			return { text: error instanceof Error ? error.message : String(error), error: true };
		}
	}

	const tabLabel = (value: Tab) => ({ settings: labels.settings, input: labels.inputTab, output: labels.outputTab })[value];
</script>

<aside class="fb-inspector" aria-label={def?.title ?? labels.flow}>
	{#if node && def}
		<div class="fb-insp-head">
			<span class="fb-node-icon large"><Icon name={def.icon ?? 'sparkle'} size={18} /></span>
			<div class="fb-insp-titles">
				<span class="fb-eyebrow">{category}</span>
				<span class="fb-insp-title">{def.title}</span>
			</div>
		</div>
		<p class="fb-insp-desc">{def.description}</p>

		<div class="fb-tabs" role="tablist">
			{#each TABS as value (value)}
				<button class="fb-tab" class:is-on={tab === value} role="tab" aria-selected={tab === value} onclick={() => (tab = value)}>
					{tabLabel(value)}
					{#if value === 'output' && record}<span class="fb-tab-dot is-{record.status}"></span>{/if}
				</button>
			{/each}
		</div>

		{#if tab !== 'settings' && records.length > 1}
			<label class="fb-iteration">
				<span class="fb-field-label">{labels.iteration}</span>
				<select
					class="fb-select"
					value={String(iteration < 0 ? records.length - 1 : iteration)}
					onchange={(event) => (iteration = Number(event.currentTarget.value))}
				>
					{#each records as [key], index (key)}
						<option value={String(index)}>{key}</option>
					{/each}
				</select>
			</label>
		{/if}

		{#if tab === 'settings'}
			<label class="fb-field">
				<span class="fb-field-label">{labels.name}</span>
				<input
					class="fb-input"
					value={node.data.label ?? ''}
					placeholder={def.title}
					disabled={readonly}
					oninput={(event) => onlabel(event.currentTarget.value)}
				/>
			</label>

			{#each fields as [key, field] (key)}
				{@const problems = nodeIssues.filter((issue) => fieldKey(issue) === key)}
				{@const preview = previewOf(node.data.config[key])}
				<div class="fb-field" class:has-issue={problems.some((p) => p.level === 'error')} role="group" aria-label={fieldLabel(key, field)}>
					<span class="fb-field-label">
						{fieldLabel(key, field)}{field.optional && field.default === undefined ? ` (${labels.optional})` : ''}
					</span>
					<FieldInput {field} value={node.data.config[key]} disabled={readonly} {suggestions} onchange={(value) => onconfig(key, value)} />
					{#if preview}
						<span class="fb-preview" class:is-error={preview.error}><span class="fb-preview-label">{labels.preview}</span>{preview.text}</span>
					{/if}
					{#if field.description}<span class="fb-help">{field.description}</span>{/if}
					{#each problems as problem, i (i)}
						<span class="fb-field-issue {problem.level}">{withoutName(problem.message)}</span>
					{/each}
				</div>
			{/each}

			{#if otherIssues.length}
				<div class="fb-issues">
					{#each otherIssues as issue, i (i)}
						<div class="fb-issue {issue.level}">
							<Icon name="alert" size={14} />
							<span>{issue.message}</span>
						</div>
					{/each}
				</div>
			{/if}

			{#if !def.trigger}
				<details class="fb-data" open>
					<summary>{labels.dataFromSteps}</summary>
					{#if upstreamData.length === 0}
						<p class="fb-help">{labels.noUpstream}</p>
					{:else}
						<p class="fb-help">{labels.dragToMap}</p>
						{#each upstreamData as step (step.id)}
							<div class="fb-data-step">
								<div class="fb-data-title">{step.title}</div>
								{#if step.ran}
									<div class="fb-tree" role="tree"><JsonTree value={step.output} path={`steps.${step.id}.output`} label="output" /></div>
								{:else}
									<span class="fb-help">{labels.notRunYet}</span>
								{/if}
							</div>
						{/each}
						{#if !editor.lastRun && onrun}
							<button class="fb-btn" onclick={onrun}><Icon name="play" size={13} />{labels.runNow}</button>
						{/if}
					{/if}
				</details>
			{/if}

			{#if !readonly}
				<div class="fb-insp-actions">
					<button class="fb-btn" onclick={onduplicate}><Icon name="copy" size={14} />{labels.duplicate}</button>
					<button class="fb-btn" onclick={ontoggle}>{node.data.disabled ? labels.enable : labels.disable}</button>
					<button class="fb-btn danger" onclick={ondelete}><Icon name="trash" size={14} />{labels.delete}</button>
				</div>
			{/if}
		{:else if !record}
			<p class="fb-insp-desc fb-flush">{labels.noRunData}</p>
			{#if onrun}<button class="fb-btn fb-self-start" onclick={onrun}><Icon name="play" size={13} />{labels.runNow}</button>{/if}
		{:else if tab === 'input'}
			<div class="fb-tree" role="tree"><JsonTree value={record.input} path="input" label="input" /></div>
		{:else}
			{#if record.error}
				<div class="fb-issue error"><Icon name="alert" size={14} /><span>{record.error}</span></div>
			{/if}
			{#if record.wait}
				<p class="fb-help">{format(labels.waitingFor, { reason: record.wait.reason })}</p>
			{/if}
			{#if record.output !== undefined}
				<div class="fb-tree" role="tree"><JsonTree value={record.output} path={recordScope ? '' : `steps.${node.id}.output`} label="output" /></div>
			{/if}
			{#if record.logs?.length}
				<div class="fb-logs">
					<span class="fb-eyebrow">{labels.logs}</span>
					{#each record.logs as entry, i (i)}
						<code>{entry.message}</code>
					{/each}
				</div>
			{/if}
		{/if}
	{:else}
		<div class="fb-insp-titles">
			<span class="fb-eyebrow">{labels.flow}</span>
			<span class="fb-insp-title">{issues.length ? labels.needsAttention : labels.looksGood}</span>
		</div>

		{#if issues.length}
			<div class="fb-issues">
				{#each issues as issue, i (i)}
					{#if issue.nodeId}
						<button class="fb-issue {issue.level}" onclick={() => onfocus(issue.nodeId!)}>
							<Icon name="alert" size={14} />
							<span>{issue.message}</span>
						</button>
					{:else}
						<div class="fb-issue {issue.level}">
							<Icon name="alert" size={14} />
							<span>{issue.message}</span>
						</div>
					{/if}
				{/each}
			</div>
		{:else}
			<p class="fb-insp-desc fb-flush">{labels.allGood}</p>
		{/if}

		{#if !readonly}
			<ul class="fb-hints">
				<li>{labels.hintAdd}</li>
				<li>{labels.hintConnect}</li>
				{#if editor.ui.json}<li>{labels.hintJson}</li>{/if}
				<li>{labels.hintDelete}</li>
			</ul>
		{/if}
	{/if}
</aside>
