<script lang="ts">
	import Icon from './Icon.svelte';
	import { isFieldVisible, type Issue } from '../flow/validate';
	import type { Registry } from '../flow/registry';
	import type { FlowNode } from '../flow/types';

	let {
		node,
		registry,
		issues,
		onconfig,
		onlabel,
		ondelete,
		onduplicate,
		onfocus
	}: {
		node: FlowNode | null;
		registry: Registry;
		issues: Issue[];
		onconfig: (key: string, value: unknown) => void;
		onlabel: (label: string) => void;
		ondelete: () => void;
		onduplicate: () => void;
		onfocus: (nodeId: string) => void;
	} = $props();

	const def = $derived(node ? registry.get(node.data.kind) : undefined);
	const category = $derived(registry.categories.find((c) => c.id === def?.category)?.label);
	const nodeIssues = $derived(node ? issues.filter((i) => i.nodeId === node.id) : []);
	const fields = $derived(node && def?.fields ? def.fields.filter((f) => isFieldVisible(f, node.data.config)) : []);

	const text = (value: unknown) => (value === undefined || value === null ? '' : String(value));

	function readNumber(event: Event) {
		const raw = (event.currentTarget as HTMLInputElement).value;
		return raw === '' ? '' : Number(raw);
	}
</script>

<aside class="fb-inspector" aria-label="Step settings">
	{#if node && def}
		<div class="fb-insp-head">
			<span class="fb-node-icon large"><Icon name={def.icon} size={18} /></span>
			<div class="fb-insp-titles">
				<span class="fb-eyebrow">{def.trigger ? 'Trigger' : category}</span>
				<span class="fb-insp-title">{def.title}</span>
			</div>
		</div>
		<p class="fb-insp-desc">{def.description}</p>

		<label class="fb-field">
			<span>Name</span>
			<input
				class="fb-input"
				value={node.data.label ?? ''}
				placeholder={def.title}
				oninput={(event) => onlabel(event.currentTarget.value)}
			/>
		</label>

		{#each fields as field (field.key)}
			{@const value = node.data.config[field.key]}
			{#if field.type === 'toggle'}
				<label class="fb-toggle">
					<input
						type="checkbox"
						checked={Boolean(value)}
						onchange={(event) => onconfig(field.key, event.currentTarget.checked)}
					/>
					{field.label}
				</label>
			{:else}
				<label class="fb-field">
					<span>{field.label}</span>
					{#if field.type === 'textarea'}
						<textarea
							class="fb-textarea"
							class:mono={field.mono}
							value={text(value)}
							placeholder={field.placeholder}
							spellcheck={!field.mono}
							oninput={(event) => onconfig(field.key, event.currentTarget.value)}
						></textarea>
					{:else if field.type === 'select'}
						<select
							class="fb-select"
							value={text(value)}
							onchange={(event) => onconfig(field.key, event.currentTarget.value)}
						>
							{#each field.options ?? [] as option (option.value)}
								<option value={option.value}>{option.label}</option>
							{/each}
						</select>
					{:else if field.type === 'number'}
						<div class="fb-with-suffix">
							<input
								class="fb-input"
								class:mono={field.mono}
								type="number"
								min={field.min}
								max={field.max}
								step={field.step}
								value={text(value)}
								placeholder={field.placeholder}
								oninput={(event) => onconfig(field.key, readNumber(event))}
							/>
							{#if field.suffix}<span>{field.suffix}</span>{/if}
						</div>
					{:else}
						<input
							class="fb-input"
							class:mono={field.mono}
							value={text(value)}
							placeholder={field.placeholder}
							spellcheck={!field.mono}
							oninput={(event) => onconfig(field.key, event.currentTarget.value)}
						/>
					{/if}
					{#if field.help}<span class="fb-help">{field.help}</span>{/if}
				</label>
			{/if}
		{/each}

		{#if nodeIssues.length}
			<div class="fb-issues">
				{#each nodeIssues as issue, i (i)}
					<div class="fb-issue {issue.level}">
						<Icon name="alert" size={14} />
						<span>{issue.message}</span>
					</div>
				{/each}
			</div>
		{/if}

		<div class="fb-insp-actions">
			<button class="fb-btn" onclick={onduplicate}><Icon name="copy" size={14} />Duplicate</button>
			<button class="fb-btn danger" onclick={ondelete}><Icon name="trash" size={14} />Delete</button>
		</div>
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

		<ul class="fb-hints">
			<li>Click a step on the left, or drag it onto the canvas.</li>
			<li>Drag from a dot on the right of a step to connect it.</li>
			<li>Select a step to edit it. <kbd>Backspace</kbd> deletes.</li>
		</ul>
	{/if}
</aside>
