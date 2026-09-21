<script lang="ts">
	import { tick } from 'svelte';
	import { FILTERS } from '@arcsig-labs/core';
	import { EXPRESSION_DRAG, type Suggestion } from './context.svelte.js';

	/**
	 * A text input or textarea that understands `{{ expressions }}`: typing inside `{{ }}` suggests paths
	 * (and filters after `|`), and values dragged from run data are inserted at the caret.
	 */
	let {
		value,
		oninput,
		multiline = false,
		mono = false,
		placeholder,
		disabled = false,
		inputmode,
		suggestions = []
	}: {
		value: string;
		oninput: (text: string) => void;
		multiline?: boolean;
		mono?: boolean;
		placeholder?: string;
		disabled?: boolean;
		inputmode?: 'text' | 'decimal';
		suggestions?: Suggestion[];
	} = $props();

	const FILTER_SUGGESTIONS: Suggestion[] = Object.keys(FILTERS).map((name) => ({ path: name, detail: 'filter' }));

	let element = $state<HTMLInputElement | HTMLTextAreaElement>();
	let open = $state(false);
	let items = $state<Suggestion[]>([]);
	let active = $state(0);
	let tokenStart = 0;
	let tokenEnd = 0;

	/** True when `rest` goes more than one level below the typed token. */
	const isDeeper = (rest: string) => rest.replace(/^[.[]/, '').search(/[.[]/) !== -1;

	function refresh() {
		const el = element;
		if (!el || disabled) return;
		const caret = el.selectionStart ?? el.value.length;
		const before = el.value.slice(0, caret);
		const opening = before.lastIndexOf('{{');
		if (opening === -1 || before.lastIndexOf('}}') > opening) {
			open = false;
			return;
		}
		const inside = before.slice(opening + 2);
		const pipe = inside.lastIndexOf('|');
		const token = (pipe === -1 ? inside : inside.slice(pipe + 1)).replace(/^\s+/, '');
		if (pipe !== -1 && token.includes(':')) {
			open = false;
			return;
		}
		const fallback = token.lastIndexOf('??');
		const typed = fallback === -1 ? token : token.slice(fallback + 2).replace(/^\s+/, '');
		tokenStart = caret - typed.length;
		tokenEnd = caret;

		const pool = pipe === -1 ? suggestions : FILTER_SUGGESTIONS;
		const lower = typed.toLowerCase();
		items = pool
			.filter((item) => item.path.toLowerCase().startsWith(lower) && item.path !== typed && !isDeeper(item.path.slice(typed.length)))
			.slice(0, 12);
		active = 0;
		open = items.length > 0;
	}

	async function apply(item: Suggestion) {
		const el = element;
		if (!el) return;
		const text = el.value;
		const after = text.slice(tokenEnd);
		const closing = after.includes('}}') ? '' : ' }}';
		const next = text.slice(0, tokenStart) + item.path + closing + after;
		oninput(next);
		open = false;
		await tick();
		const caret = tokenStart + item.path.length;
		el.focus();
		el.setSelectionRange(caret, caret);
		refresh();
	}

	function onkeydown(event: KeyboardEvent) {
		if (!open) return;
		if (event.key === 'ArrowDown') {
			active = (active + 1) % items.length;
		} else if (event.key === 'ArrowUp') {
			active = (active - 1 + items.length) % items.length;
		} else if (event.key === 'Enter' || event.key === 'Tab') {
			void apply(items[active]);
		} else if (event.key === 'Escape') {
			open = false;
			event.stopPropagation();
		} else {
			return;
		}
		event.preventDefault();
	}

	function onkeyup(event: KeyboardEvent) {
		if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) refresh();
	}

	function handleInput(event: Event) {
		oninput((event.currentTarget as HTMLInputElement | HTMLTextAreaElement).value);
		refresh();
	}

	function ondragover(event: DragEvent) {
		if (disabled || !event.dataTransfer?.types.includes(EXPRESSION_DRAG)) return;
		event.preventDefault();
		event.dataTransfer.dropEffect = 'copy';
	}

	function ondrop(event: DragEvent) {
		const expression = event.dataTransfer?.getData(EXPRESSION_DRAG);
		const el = element;
		if (!expression || disabled || !el) return;
		event.preventDefault();
		const text = el.value;
		const at = document.activeElement === el ? (el.selectionEnd ?? text.length) : text.length;
		oninput(text.slice(0, at) + expression + text.slice(at));
	}

	const close = () => setTimeout(() => (open = false), 120);
</script>

<div class="fb-expr">
	{#if multiline}
		<textarea
			bind:this={element}
			class="fb-textarea"
			class:mono
			{value}
			{placeholder}
			{disabled}
			spellcheck={!mono}
			oninput={handleInput}
			{onkeydown}
			{onkeyup}
			onclick={refresh}
			onblur={close}
			{ondragover}
			{ondrop}
		></textarea>
	{:else}
		<input
			bind:this={element}
			class="fb-input"
			class:mono
			{value}
			{placeholder}
			{disabled}
			{inputmode}
			spellcheck={!mono}
			autocomplete="off"
			oninput={handleInput}
			{onkeydown}
			{onkeyup}
			onclick={refresh}
			onblur={close}
			{ondragover}
			{ondrop}
		/>
	{/if}
	{#if open}
		<ul class="fb-suggest" role="listbox">
			{#each items as item, index (item.path)}
				<li role="option" aria-selected={index === active} class:is-active={index === active}>
					<button type="button" tabindex="-1" onmousedown={(event) => { event.preventDefault(); void apply(item); }}>
						<code>{item.path}</code>
						{#if item.detail}<span>{item.detail}</span>{/if}
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</div>
