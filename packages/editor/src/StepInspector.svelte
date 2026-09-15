<script lang="ts">
	import { fieldLabel, isFieldVisible, type AnyNodeDefinition, type Issue, type Shape } from '@arcflow/core';
	import FieldInput from './FieldInput.svelte';
	import Icon from './Icon.svelte';
	import { getEditor } from './context.svelte.js';
	import type { CanvasNode } from './convert.js';

	let {
		node,
		issues,
		onconfig,
		onlabel,
		ontoggle,
		ondelete,
		onduplicate,
		onfocus
	}: {
		node: CanvasNode | null;
		issues: Issue[];
		onconfig: (key: string, value: unknown) => void;
		onlabel: (label: string) => void;
		ontoggle: () => void;
		ondelete: () => void;
		onduplicate: () => void;
		onfocus: (nodeId: string) => void;
	} = $props();

	const editor = getEditor();
	const labels = $derived(editor.labels);
	const readonly = $derived(editor.readonly);

	const def = $derived<AnyNodeDefinition | undefined>(node ? editor.registry.get(node.data.kind) : undefined);
	const category = $derived(
		def?.trigger
			? labels.trigger
			: (editor.registry.categories as { id: string; label: string }[]).find((c) => c.id === (def?.category ?? 'other'))?.label
	);
	const fieldKey = (issue: Issue) => /\.config\.([^.[\]]+)/.exec(issue.path)?.[1];
	const nodeIssues = $derived(node ? issues.filter((issue) => issue.nodeId === node.id) : []);
	const fields = $derived(
		node && def ? Object.entries(def.config as Shape).filter(([, field]) => isFieldVisible(field, node.data.config, def.config)) : []
	);
	const otherIssues = $derived(nodeIssues.filter((issue) => !fields.some(([key]) => key === fieldKey(issue))));
	// Issue messages start with the step name; under a field that is redundant.
	const withoutName = (message: string) => (node && def ? message.replace(`${node.data.label || def.title}: `, '') : message);
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
			<div class="fb-field" class:has-issue={problems.some((p) => p.level === 'error')} role="group" aria-label={fieldLabel(key, field)}>
				<span class="fb-field-label">
					{fieldLabel(key, field)}{field.optional && field.default === undefined ? ` (${labels.optional})` : ''}
				</span>
				<FieldInput {field} value={node.data.config[key]} disabled={readonly} onchange={(value) => onconfig(key, value)} />
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

		{#if !readonly}
			<div class="fb-insp-actions">
				<button class="fb-btn" onclick={onduplicate}><Icon name="copy" size={14} />{labels.duplicate}</button>
				<button class="fb-btn" onclick={ontoggle}>{node.data.disabled ? labels.enable : labels.disable}</button>
				<button class="fb-btn danger" onclick={ondelete}><Icon name="trash" size={14} />{labels.delete}</button>
			</div>
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
