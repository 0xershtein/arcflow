<script lang="ts">
	import { defaultsOf, fieldLabel, isExpression, isField, type Field, type Shape } from '@arcflow/core';
	import FieldInput from './FieldInput.svelte';
	import Icon from './Icon.svelte';
	import { getEditor } from './context.svelte.js';

	/** Renders an input for one config field, recursing into lists. */
	let {
		field,
		value,
		onchange,
		disabled = false,
		compact = false,
		placeholder
	}: {
		field: Field;
		value: unknown;
		onchange: (value: unknown) => void;
		disabled?: boolean;
		compact?: boolean;
		placeholder?: string;
	} = $props();

	const editor = getEditor();
	const labels = $derived(editor.labels);

	const NUMBER = /^\s*-?\d+(\.\d+)?\s*$/;
	const text = (v: unknown) => (v === undefined || v === null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v));
	// Keep partial input ("1.", "{{ vars") as text; the inspector shows the issue until it parses.
	const readNumber = (raw: string) => (raw.trim() === '' ? undefined : NUMBER.test(raw) ? Number(raw) : raw);

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
</script>

{#if field.kind === 'string'}
	{#if field.multiline}
		<textarea
			class="fb-textarea"
			class:mono={field.mono}
			value={text(value)}
			placeholder={placeholder ?? field.placeholder}
			spellcheck={!field.mono}
			{disabled}
			oninput={(event) => onchange(event.currentTarget.value)}
		></textarea>
	{:else}
		<input
			class="fb-input"
			class:mono={field.mono}
			value={text(value)}
			placeholder={placeholder ?? field.placeholder}
			spellcheck={!field.mono}
			{disabled}
			oninput={(event) => onchange(event.currentTarget.value)}
		/>
	{/if}
{:else if field.kind === 'number'}
	<div class="fb-with-suffix">
		<input
			class="fb-input"
			class:mono={isExpression(value)}
			inputmode="decimal"
			value={text(value)}
			placeholder={placeholder ?? field.placeholder}
			{disabled}
			oninput={(event) => onchange(readNumber(event.currentTarget.value))}
		/>
		{#if field.unit && !compact}<span>{field.unit}</span>{/if}
	</div>
{:else if field.kind === 'boolean'}
	<input type="checkbox" checked={value === true} {disabled} onchange={(event) => onchange(event.currentTarget.checked)} />
{:else if field.kind === 'enum'}
	<select class="fb-select" value={text(value)} {disabled} onchange={(event) => onchange(event.currentTarget.value)}>
		{#if typeof value === 'string' && !field.values.includes(value)}
			<option {value}>{value}</option>
		{/if}
		{#each field.values as option (option)}
			<option value={option}>{field.labels?.[option] ?? option}</option>
		{/each}
	</select>
{:else if field.kind === 'list'}
	{#if isExpression(value)}
		<div class="fb-list-expression">
			<input class="fb-input mono" {value} {disabled} oninput={(event) => onchange(event.currentTarget.value)} />
			<button class="fb-btn ghost" type="button" {disabled} onclick={() => onchange([])}>{labels.useList}</button>
		</div>
	{:else}
		<div class="fb-list">
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
								onchange={(next) => setItem(index, { ...(item as Record<string, unknown>), [key]: next })}
							/>
						{/each}
					{:else if itemField}
						<FieldInput field={itemField} value={item} compact {disabled} onchange={(next) => setItem(index, next)} />
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
