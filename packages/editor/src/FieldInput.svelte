<script lang="ts">
	import { defaultsOf, fieldLabel, isExpression, isField, type Field, type Shape } from '@arcflow/core';
	import ExpressionInput from './ExpressionInput.svelte';
	import FieldInput from './FieldInput.svelte';
	import Icon from './Icon.svelte';
	import { EXPRESSION_DRAG, getEditor, type Suggestion } from './context.svelte.js';

	/** Renders an input for one config field, recursing into lists. */
	let {
		field,
		value,
		onchange,
		disabled = false,
		compact = false,
		placeholder,
		suggestions = []
	}: {
		field: Field;
		value: unknown;
		onchange: (value: unknown) => void;
		disabled?: boolean;
		compact?: boolean;
		placeholder?: string;
		suggestions?: Suggestion[];
	} = $props();

	const editor = getEditor();
	const labels = $derived(editor.labels);

	const NUMBER = /^\s*-?\d+(\.\d+)?\s*$/;
	const text = (v: unknown) => (v === undefined || v === null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v));
	// Keep partial input ("1.", "{{ vars") as text; the inspector shows the issue until it parses.
	const readNumber = (raw: string) => (raw.trim() === '' ? undefined : NUMBER.test(raw) ? Number(raw) : raw);
	const readJson = (raw: string) => {
		if (!raw.trim()) return undefined;
		try {
			return JSON.parse(raw);
		} catch {
			return raw; // plain text and expressions are valid JSON values too
		}
	};

	const items = $derived(Array.isArray(value) ? value : []);
	const itemShape = $derived(field.kind === 'list' && !isField(field.item) ? (field.item as Shape) : null);
	const itemField = $derived(field.kind === 'list' && isField(field.item) ? (field.item as Field) : null);
	const columns = $derived(
		itemShape
			? `${Object.values(itemShape)
					.map((sub) => (sub.kind === 'number' || sub.kind === 'boolean' ? 'minmax(0, 0.7fr)' : 'minmax(0, 1.3fr)'))
					.join(' ')} 30px`
			: 'minmax(0, 1fr) 30px'
	);

	function newItem() {
		if (itemShape) return defaultsOf(itemShape);
		if (itemField) return itemField.default ?? (itemField.kind === 'string' ? '' : undefined);
		return undefined;
	}
	const setItem = (index: number, next: unknown) => onchange(items.map((item, i) => (i === index ? next : item)));
	const removeItem = (index: number) => onchange(items.filter((_, i) => i !== index));

	/** Dropping a value on a select or checkbox replaces the value with the expression. */
	function acceptDrop(event: DragEvent) {
		if (disabled || !event.dataTransfer?.types.includes(EXPRESSION_DRAG)) return;
		event.preventDefault();
		event.dataTransfer.dropEffect = 'copy';
	}
	function dropExpression(event: DragEvent) {
		const expression = event.dataTransfer?.getData(EXPRESSION_DRAG);
		if (!expression || disabled) return;
		event.preventDefault();
		onchange(expression);
	}
</script>

{#if field.kind === 'string'}
	<ExpressionInput
		value={text(value)}
		multiline={field.multiline}
		mono={field.mono}
		placeholder={placeholder ?? field.placeholder}
		{disabled}
		{suggestions}
		oninput={(next) => onchange(next)}
	/>
{:else if field.kind === 'number'}
	<div class="fb-with-suffix">
		<ExpressionInput
			value={text(value)}
			mono={isExpression(value)}
			inputmode="decimal"
			placeholder={placeholder ?? field.placeholder}
			{disabled}
			{suggestions}
			oninput={(next) => onchange(readNumber(next))}
		/>
		{#if field.unit && !compact}<span>{field.unit}</span>{/if}
	</div>
{:else if field.kind === 'boolean'}
	<span class="fb-drop-target" role="group" ondragover={acceptDrop} ondrop={dropExpression}>
		{#if isExpression(value)}
			<ExpressionInput value={String(value)} mono {disabled} {suggestions} oninput={(next) => onchange(next === 'true' ? true : next === 'false' ? false : next)} />
		{:else}
			<input type="checkbox" checked={value === true} {disabled} onchange={(event) => onchange(event.currentTarget.checked)} />
		{/if}
	</span>
{:else if field.kind === 'enum'}
	{#if isExpression(value)}
		<div class="fb-list-expression">
			<ExpressionInput value={String(value)} mono {disabled} {suggestions} oninput={(next) => onchange(next)} />
			<button class="fb-btn ghost" type="button" {disabled} onclick={() => onchange(field.default ?? field.values[0])}>{labels.useList}</button>
		</div>
	{:else}
		<select class="fb-select" value={text(value)} {disabled} onchange={(event) => onchange(event.currentTarget.value)} ondragover={acceptDrop} ondrop={dropExpression}>
			{#each field.values as option (option)}
				<option value={option}>{field.labels?.[option] ?? option}</option>
			{/each}
		</select>
	{/if}
{:else if field.kind === 'credential'}
	<input
		class="fb-input mono"
		value={text(value)}
		placeholder={placeholder ?? field.type}
		spellcheck="false"
		autocomplete="off"
		{disabled}
		oninput={(event) => onchange(event.currentTarget.value || undefined)}
	/>
{:else if field.kind === 'json'}
	<ExpressionInput
		value={typeof value === 'string' ? value : value === undefined ? '' : JSON.stringify(value, null, 2)}
		multiline
		mono
		placeholder={placeholder ?? field.placeholder ?? '{ }'}
		{disabled}
		{suggestions}
		oninput={(next) => onchange(readJson(next))}
	/>
{:else if field.kind === 'list'}
	{#if isExpression(value)}
		<div class="fb-list-expression">
			<ExpressionInput value={String(value)} mono {disabled} {suggestions} oninput={(next) => onchange(next)} />
			<button class="fb-btn ghost" type="button" {disabled} onclick={() => onchange([])}>{labels.useList}</button>
		</div>
	{:else}
		<div class="fb-list" role="group" ondragover={acceptDrop} ondrop={(event) => items.length === 0 && dropExpression(event)}>
			{#if itemShape && items.length}
				<div class="fb-list-row fb-list-head" style:grid-template-columns={columns}>
					{#each Object.entries(itemShape) as [key, sub] (key)}
						<span>{fieldLabel(key, sub)}</span>
					{/each}
					<span></span>
				</div>
			{/if}
			{#each items as item, index (index)}
				<div class="fb-list-row" style:grid-template-columns={columns}>
					{#if itemShape}
						{#each Object.entries(itemShape) as [key, sub] (key)}
							<FieldInput
								field={sub}
								value={(item as Record<string, unknown> | undefined)?.[key]}
								placeholder={fieldLabel(key, sub)}
								compact
								{disabled}
								{suggestions}
								onchange={(next) => setItem(index, { ...(item as Record<string, unknown>), [key]: next })}
							/>
						{/each}
					{:else if itemField}
						<FieldInput field={itemField} value={item} compact {disabled} {suggestions} onchange={(next) => setItem(index, next)} />
					{/if}
					<button class="fb-icon-btn" type="button" aria-label="{labels.remove} {index + 1}" {disabled} onclick={() => removeItem(index)}>
						<Icon name="x" size={14} />
					</button>
				</div>
			{/each}
			<button class="fb-btn ghost fb-list-add" type="button" {disabled} onclick={() => onchange([...items, newItem()])}>
				<Icon name="plus" size={14} />{labels.add}
			</button>
		</div>
	{/if}
{/if}
