<script lang="ts">
	import { browser } from '$app/environment';
	import { FlowEditor, type ThemeOptions, type UiOptions } from '@arcsig-labs/editor/svelte';
	import { standardRegistry } from '@arcsig-labs/nodes';
	import CodeBlock from './Code.svelte';
	import Segmented from './Segmented.svelte';
	import { createPlaygroundFlow } from './demo-flow';
	import { labelsDe } from './labels-de';
	import { Code, literal } from './literal';

	/**
	 * One editor instance whose options change in place — the same thing `editor.setOptions()`
	 * does for `createEditor`. `steps` and `flow` are set once; everything below is live.
	 */
	const flow = createPlaygroundFlow();

	type Shape = NonNullable<UiOptions['node']>;
	type Mode = 'auto' | 'light' | 'dark';
	type Preset = 'default' | 'green' | 'serif';
	type Toolbar = 'full' | 'brand' | 'strip' | 'off';
	type Background = NonNullable<UiOptions['background']>;

	let shape = $state<Shape>('card');
	let mode = $state<Mode>('auto');
	let preset = $state<Preset>('default');
	let toolbar = $state<Toolbar>('full');
	let palette = $state<'on' | 'off'>('on');
	// Off by default: in the docs column the canvas is otherwise too narrow to read the steps.
	let inspector = $state<'on' | 'off'>('off');
	let minimap = $state<'off' | 'on'>('off');
	let background = $state<Background>('dots');
	let language = $state<'en' | 'de'>('en');
	let readonly = $state<'off' | 'on'>('off');
	let width = $state<'full' | 'narrow'>('full');

	const presets: Record<Preset, Omit<ThemeOptions, 'mode'> | undefined> = {
		default: undefined,
		green: { colors: { accent: '#16a34a', accentSoft: 'rgba(22, 163, 74, 0.14)' }, radius: 4 },
		serif: {
			colors: { accent: '#c2410c', accentSoft: 'rgba(194, 65, 12, 0.14)' },
			fontFamily: 'Georgia, "Times New Roman", serif',
			radius: 16
		}
	};

	/** Every labelled button off and the name gone: what is left is a 40px strip. */
	const strip = { name: false, json: false, importExport: false, flows: false, executions: false, run: false, testRun: false };

	const theme = $derived.by((): ThemeOptions | Mode | undefined => {
		const extra = presets[preset];
		if (!extra) return mode === 'auto' ? undefined : mode;
		return mode === 'auto' ? { ...extra } : { mode, ...extra };
	});

	const ui = $derived.by((): UiOptions => {
		const next: UiOptions = {};
		if (shape !== 'card') next.node = shape;
		if (toolbar === 'brand') next.toolbar = { name: false };
		if (toolbar === 'strip') next.toolbar = { ...strip };
		if (toolbar === 'off') next.toolbar = false;
		if (palette === 'off') next.palette = false;
		if (inspector === 'off') next.inspector = false;
		if (minimap === 'on') next.minimap = true;
		if (background !== 'dots') next.background = background;
		return next;
	});

	const labels = $derived(language === 'de' ? labelsDe : undefined);
	const isReadonly = $derived(readonly === 'on');

	/** The options that differ from the defaults, in the order the README lists them. */
	const changed = $derived.by(() => {
		const entries: [string, unknown][] = [];
		if (theme !== undefined) entries.push(['theme', theme]);
		if (Object.keys(ui).length) entries.push(['ui', ui]);
		if (labels) entries.push(['labels', new Code('labelsDe')]);
		if (isReadonly) entries.push(['readonly', true]);
		return entries;
	});

	const snippet = $derived.by(() => {
		const lines: string[] = [];
		if (toolbar === 'brand') {
			// `brand` is a Svelte snippet, so this look is written for the Svelte entry.
			lines.push(`<FlowEditor`, `\tsteps={standardRegistry}`, `\t{flow}`);
			for (const [key, value] of changed) {
				const text = literal(value, 1);
				lines.push(value === true ? `\t${key}` : `\t${key}={${text}}`);
			}
			lines.push(`>`, `\t{#snippet brand()}<strong>Payouts</strong>{/snippet}`, `</FlowEditor>`);
		} else {
			lines.push(`createEditor('#editor', {`, `\tsteps: standardRegistry,`, `\tflow${changed.length ? ',' : ''}`);
			changed.forEach(([key, value], index) => lines.push(`\t${key}: ${literal(value, 1)}${index < changed.length - 1 ? ',' : ''}`));
			lines.push(`});`);
		}
		if (width === 'narrow') lines.push('', '// No option for the 420px frame: the layout follows the width of the container.');
		return lines.join('\n');
	});

	const labelsCode = `const labelsDe = ${literal(labelsDe)};`;
</script>

<div class="playground">
	<div class="controls">
		<Segmented label="Step shape" bind:value={shape} options={[{ value: 'card', label: 'card' }, { value: 'tile', label: 'tile' }, { value: 'compact', label: 'compact' }]} />
		<Segmented label="Theme" bind:value={mode} options={[{ value: 'auto', label: 'auto' }, { value: 'light', label: 'light' }, { value: 'dark', label: 'dark' }]} />
		<Segmented
			label="Look"
			bind:value={preset}
			options={[{ value: 'default', label: 'Default' }, { value: 'green', label: 'Green' }, { value: 'serif', label: 'Serif' }]}
		/>
		<Segmented
			label="Toolbar"
			bind:value={toolbar}
			options={[{ value: 'full', label: 'Full' }, { value: 'brand', label: 'Brand' }, { value: 'strip', label: 'Strip' }, { value: 'off', label: 'Off' }]}
		/>
		<Segmented label="Step list" bind:value={palette} options={[{ value: 'on', label: 'on' }, { value: 'off', label: 'off' }]} />
		<Segmented label="Inspector" bind:value={inspector} options={[{ value: 'on', label: 'on' }, { value: 'off', label: 'off' }]} />
		<Segmented label="Minimap" bind:value={minimap} options={[{ value: 'off', label: 'off' }, { value: 'on', label: 'on' }]} />
		<Segmented
			label="Background"
			bind:value={background}
			options={[{ value: 'dots', label: 'dots' }, { value: 'lines', label: 'lines' }, { value: 'cross', label: 'cross' }, { value: 'none', label: 'none' }]}
		/>
		<Segmented label="Labels" bind:value={language} options={[{ value: 'en', label: 'English' }, { value: 'de', label: 'Deutsch' }]} />
		<Segmented label="Read-only" bind:value={readonly} options={[{ value: 'off', label: 'off' }, { value: 'on', label: 'on' }]} />
		<Segmented class="width-switch" label="Container" bind:value={width} options={[{ value: 'full', label: 'Full width' }, { value: 'narrow', label: '420px' }]} />
	</div>

	<div class="frame" class:narrow={width === 'narrow'}>
		{#if browser}
			<FlowEditor steps={standardRegistry} {flow} {theme} {ui} {labels} readonly={isReadonly} brand={toolbar === 'brand' ? brand : undefined} />
		{:else}
			<p class="placeholder">Loading the editor…</p>
		{/if}
	</div>

	<p class="caption">The options that produce what you see — only the ones that differ from the defaults:</p>
	<CodeBlock code={snippet} language={toolbar === 'brand' ? 'svelte' : 'ts'} />
	{#if language === 'de'}
		<CodeBlock code={labelsCode} />
	{/if}
</div>

{#snippet brand()}
	<strong class="brand">Payouts</strong>
{/snippet}

<style>
	.playground {
		margin: 0 0 28px;
	}

	.controls {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 10px 24px;
		margin: 0 0 16px;
	}

	.frame {
		height: 600px;
		margin: 0 0 16px;
		border: 1px solid var(--line-strong);
		border-radius: 12px;
		overflow: hidden;
		background: var(--surface-2);
	}

	/* The editor folds below 820px of its own width and the column is 812px, so on a wide
	   screen the frame bleeds into the gutters to show the full layout. */
	@media (min-width: 961px) {
		.frame:not(.narrow) {
			margin-inline: -12px;
		}
	}

	/* On wide screens the frame also takes the free space right of the column, so the
	   canvas keeps a readable width with the step list and the inspector open. */
	@media (min-width: 1240px) {
		.frame:not(.narrow) {
			margin-right: calc(-1 * min(320px, (100vw - 1140px) / 2 + 12px));
		}
	}

	.frame.narrow {
		width: 420px;
		max-width: 100%;
		height: 680px;
	}

	.placeholder {
		display: grid;
		place-items: center;
		height: 100%;
		margin: 0;
		color: var(--text-muted);
		font-size: 14px;
	}

	.caption {
		margin: 0 0 10px;
		color: var(--text-muted);
		font-size: 14px;
	}

	/* The host's content inside the editor's toolbar, so it is themed by the editor, not the site. */
	.brand {
		color: var(--fb-text);
		font-family: var(--fb-font);
		font-size: 14px;
		white-space: nowrap;
	}

	@media (max-width: 900px) {
		.controls {
			grid-template-columns: minmax(0, 1fr);
		}
	}

	/* A phone is already a narrow container; the switch would change nothing. */
	@media (max-width: 640px) {
		.playground :global(.width-switch) {
			display: none;
		}

		.frame,
		.frame.narrow {
			width: auto;
			height: 620px;
		}
	}
</style>
