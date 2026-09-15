<script lang="ts">
	import { fieldLabel, isFieldVisible, type AnyNodeDefinition, type Issue, type Registry, type Shape } from '@arcflow/core';
	import FieldInput from './FieldInput.svelte';
	import Icon from './Icon.svelte';
	import type { CanvasNode } from './convert.js';

	let {
		node,
		registry,
		issues,
		readonly = false,
		onconfig,
		onlabel,
		ontoggle,
		ondelete,
		onduplicate,
		onfocus
	}: {
		node: CanvasNode | null;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		registry: Registry<any>;
		issues: Issue[];
		readonly?: boolean;
		onconfig: (key: string, value: unknown) => void;
		onlabel: (label: string) => void;
		ontoggle: () => void;
		ondelete: () => void;
		onduplicate: () => void;
		onfocus: (nodeId: string) => void;
	} = $props();

	const def = $derived<AnyNodeDefinition | undefined>(node ? registry.get(node.data.kind) : undefined);
	const category = $derived(
		def?.trigger ? 'Trigger' : (registry.categories as { id: string; label: string }[]).find((c) => c.id === (def?.category ?? 'other'))?.label
	);
	const fieldKey = (issue: Issue) => /\.config\.([^.[\]]+)/.exec(issue.path)?.[1];
	const nodeIssues = $derived(node ? issues.filter((issue) => issue.nodeId === node.id) : []);
	const fields = $derived(
		node && def ? Object.entries(def.config as Shape).filter(([, field]) => isFieldVisible(field, node.data.config, def.config)) : []
	);
	const otherIssues = $derived(nodeIssues.filter((issue) => !fields.some(([key]) => key === fieldKey(issue))));
</script>

<aside class="fb-inspector" aria-label="Step settings">
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
			<span class="fb-field-label">Name</span>
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
				<span class="fb-field-label">{fieldLabel(key, field)}{field.optional && field.default === undefined ? ' (optional)' : ''}</span>
				<FieldInput {field} value={node.data.config[key]} disabled={readonly} onchange={(value) => onconfig(key, value)} />
				{#if field.description}<span class="fb-help">{field.description}</span>{/if}
				{#each problems as problem, i (i)}
					<span class="fb-field-issue {problem.level}">{problem.message.replace(`${node.data.label || def.title}: `, '')}</span>
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
				<button class="fb-btn" onclick={onduplicate}><Icon name="copy" size={14} />Duplicate</button>
				<button class="fb-btn" onclick={ontoggle}>{node.data.disabled ? 'Enable' : 'Disable'}</button>
				<button class="fb-btn danger" onclick={ondelete}><Icon name="trash" size={14} />Delete</button>
			</div>
		{/if}
	{:else}
		<div class="fb-insp-titles">
			<span class="fb-eyebrow">Flow</span>
			<span class="fb-insp-title">{issues.length ? 'Needs attention' : 'Looks good'}</span>
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
			<p class="fb-insp-desc" style="margin: 0">Every step is connected and configured. Press Test run to watch it go.</p>
		{/if}

		{#if !readonly}
			<ul class="fb-hints">
				<li>Click a step on the left, or drag it onto the canvas.</li>
				<li>Drag from a dot on the right of a step to connect it.</li>
				<li>Open <strong>JSON</strong> to paste a flow written by code or an LLM.</li>
				<li>Select a step to edit it. <kbd>Backspace</kbd> deletes.</li>
			</ul>
		{/if}
	{/if}
</aside>
