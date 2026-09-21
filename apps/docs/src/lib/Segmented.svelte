<script lang="ts" generics="T extends string">
	/** A labelled row of mutually exclusive choices, in the site's segmented-track style. */
	let {
		label,
		options,
		value = $bindable(),
		class: extra = ''
	}: { label: string; options: readonly { value: T; label: string }[]; value: T; class?: string } = $props();
</script>

<div class="seg {extra}">
	<span class="name" id="seg-{label.replace(/\W+/g, '-').toLowerCase()}">{label}</span>
	<div class="track" role="radiogroup" aria-labelledby="seg-{label.replace(/\W+/g, '-').toLowerCase()}">
		{#each options as option (option.value)}
			<button type="button" role="radio" aria-checked={value === option.value} class:on={value === option.value} onclick={() => (value = option.value)}>
				{option.label}
			</button>
		{/each}
	</div>
</div>

<style>
	.seg {
		display: flex;
		align-items: center;
		gap: 12px;
		min-width: 0;
	}

	.name {
		flex: none;
		width: 92px;
		color: var(--text-muted);
		font-size: 13px;
	}

	.track {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		padding: 4px;
		min-width: 0;
		border: 1px solid var(--line);
		border-radius: 10px;
	}

	button {
		height: 28px;
		padding: 0 12px;
		border: 1px solid transparent;
		border-radius: 7px;
		background: transparent;
		color: var(--text-muted);
		font: inherit;
		font-size: 14px;
		cursor: pointer;
		transition: color 0.15s cubic-bezier(0.16, 1, 0.3, 1), background-color 0.15s cubic-bezier(0.16, 1, 0.3, 1);
	}

	button:hover {
		color: var(--text);
	}

	button.on {
		border-color: var(--line);
		background: var(--surface-2);
		color: var(--text);
		font-weight: 600;
	}

	@media (max-width: 520px) {
		.seg {
			flex-direction: column;
			align-items: flex-start;
			gap: 6px;
		}

		.name {
			width: auto;
		}
	}
</style>
