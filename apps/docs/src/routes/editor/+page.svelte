<script lang="ts">
	import { base } from '$app/paths';
	import Code from '$lib/Code.svelte';
	import Demo from '$lib/Demo.svelte';
	import Tabs from '$lib/Tabs.svelte';
	import { mounting } from '$lib/frameworks';

	const theme = `createEditor('#editor', {
	steps,
	theme: {
		mode: 'dark',
		colors: { accent: '#c084fc', radius: 14 },
		nodeWidth: 260
	}
});`;

	const shapes = ['card', 'tile', 'compact'] as const;
	let shape = $state<(typeof shapes)[number]>('card');
	const shapeCode = $derived(`createEditor('#editor', { steps, ui: { node: '${shape}' } });`);

	const labelsCode = `import { defaultLabels } from '@arcflow/editor';

Object.keys(defaultLabels); // every string, with its default

createEditor('#editor', {
	steps,
	labels: { testRun: 'Çalıştır', searchSteps: 'Adım ara', emptyTitle: 'Bir tetikleyiciyle başla' }
});`;

	const server = `import { createEditor, createHttpBackend } from '@arcflow/editor';

createEditor('#editor', {
	steps,
	backend: createHttpBackend('http://localhost:8787', { apiKey })
});`;
</script>

<svelte:head><title>Editor — arcflow</title></svelte:head>

<h1>Editor</h1>
<p>
	One ES module with its styles included. It works with any framework or none, takes flow JSON in and gives flow JSON back, and never assumes your steps —
	the palette, the forms and the validation all come from the registry you pass.
</p>

<Tabs tabs={mounting} />
<p>
	The container needs a height; the editor fills it. Svelte is an optional peer dependency — only the <code>/svelte</code> entry needs it installed, because
	the default entry has Svelte compiled in. Create the editor once and push later changes through <code>setOptions</code>: recreating it costs the canvas, the
	selection and the undo history. <code>steps</code> is the one option fixed for the life of an instance.
</p>

<h2>Try it read-only</h2>
<p>The same editor with the palette and inspector hidden — what an embedded, view-only flow looks like.</p>
<Demo height="420px" readonly ui={{ palette: false, inspector: false, toolbar: false }} />

<h2>Editing</h2>
<ul>
	<li>Hover a connection and press <strong>+</strong> to insert a step; later steps move right to make room.</li>
	<li>Drag a connection into empty space (or click an output) to add a connected step.</li>
	<li>Copy, cut and paste selections as flow JSON — pasting also accepts <code>{'{ nodes, edges }'}</code> from a model, with ids and <code>{'{{ steps.… }}'}</code> references rewritten.</li>
	<li>Undo and redo, duplicate, multi-select with a box or Shift-click, sticky notes.</li>
</ul>
<table>
	<thead><tr><th>Shortcut</th><th></th></tr></thead>
	<tbody>
		<tr><td><code>⌘Z</code> / <code>⇧⌘Z</code></td><td>Undo, redo</td></tr>
		<tr><td><code>⌘C</code>, <code>⌘X</code>, <code>⌘V</code></td><td>Copy, cut, paste</td></tr>
		<tr><td><code>⌘D</code>, <code>⌘A</code></td><td>Duplicate, select all</td></tr>
		<tr><td><code>Backspace</code></td><td>Delete the selection</td></tr>
	</tbody>
</table>

<h2>Run data</h2>
<p>
	After a test run, each step's <strong>Input</strong> and <strong>Output</strong> are there as a JSON tree — per loop iteration too. Drag any value onto a
	field to insert the expression for it, or type <code>{'{{'}</code> in a field to pick from what actually ran, with a live preview underneath.
</p>

<h2>Step shapes</h2>
<p>
	<code>ui.node</code> picks how a step is drawn. All three read the same flow and keep the same handles, so switching is safe on a flow that already has
	positions. Try them on the flow below.
</p>
<div class="shapes" role="group" aria-label="Step shape">
	{#each shapes as option}
		<button class:on={shape === option} onclick={() => (shape = option)}>{option}</button>
	{/each}
</div>
<Demo height="420px" ui={{ node: shape, palette: false, inspector: false }} />
<Code code={shapeCode} />

<h2>Theming</h2>
<p>Every colour is a CSS variable, set from the <code>theme</code> option or overridden in your own stylesheet.</p>
<Code code={theme} />
<p>
	<code>colors</code> applies to both modes; <code>light</code> and <code>dark</code> override the same names for one mode only. Seventeen names cover the
	whole editor:
</p>
<table>
	<thead><tr><th>Token</th><th>Paints</th></tr></thead>
	<tbody>
		<tr><td><code>background</code></td><td>The canvas, and the panels behind everything else.</td></tr>
		<tr><td><code>surface</code></td><td>Cards, inputs, menus, the run log.</td></tr>
		<tr><td><code>surfaceHover</code></td><td>Those same surfaces when hovered or active.</td></tr>
		<tr><td><code>surfaceActive</code></td><td>Steps in the minimap.</td></tr>
		<tr><td><code>border</code></td><td>Hairlines between rows and panels.</td></tr>
		<tr><td><code>borderStrong</code></td><td>Outlines of cards, inputs and buttons.</td></tr>
		<tr><td><code>text</code></td><td>Ordinary text.</td></tr>
		<tr><td><code>textSoft</code></td><td>Secondary text: summaries, values, port labels.</td></tr>
		<tr><td><code>textMuted</code></td><td>Labels, hints, timestamps, the category above a step's name.</td></tr>
		<tr><td><code>accent</code></td><td>Selection, focus rings, step icons, running edges, run state.</td></tr>
		<tr><td><code>accentSoft</code></td><td>The translucent ring and glow behind <code>accent</code>.</td></tr>
		<tr><td><code>primary</code></td><td>The main button — Test run, Apply.</td></tr>
		<tr><td><code>primaryText</code></td><td>Text on that button.</td></tr>
		<tr><td><code>danger</code></td><td>Errors: text, borders, icons.</td></tr>
		<tr><td><code>dangerSoft</code></td><td>The background behind an error.</td></tr>
		<tr><td><code>edge</code></td><td>Connection lines.</td></tr>
		<tr><td><code>grid</code></td><td>The canvas dot or line pattern.</td></tr>
	</tbody>
</table>

<h2>Text</h2>
<p>
	Every string the editor can show is in <code>labels</code> — 129 of them, from button captions to the empty-canvas hint to validation wording. Pass the ones
	you want to change and the rest keep their defaults; <code>{'{name}'}</code> and <code>{'{count}'}</code> placeholders are filled in at render time.
</p>
<Code code={labelsCode} />

<h2>Server mode</h2>
<p>
	Give it a backend and the toolbar grows a flow list with Save and Activate, an executions panel with run history, a credential picker, and a Run button that
	runs on the server and streams events onto the canvas.
</p>
<Code code={server} />
<p>See <a href="{base}/server">Server</a> for the API behind it, and <a href="{base}/ai">AI and agents</a> for the prompt bar.</p>

<style>
	.shapes {
		display: flex;
		gap: 4px;
		margin: 0 0 14px;
		padding: 4px;
		width: fit-content;
		border: 1px solid var(--line);
		border-radius: 10px;
	}

	.shapes button {
		height: 32px;
		padding: 0 14px;
		border: 0;
		border-radius: 7px;
		background: transparent;
		color: var(--text-muted);
		font: inherit;
		font-size: 14px;
		cursor: pointer;
	}

	.shapes button:hover {
		color: var(--text);
	}

	.shapes button.on {
		background: var(--surface-2);
		color: var(--text);
	}
</style>
