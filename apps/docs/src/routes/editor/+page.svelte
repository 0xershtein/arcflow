<script lang="ts">
	import { base } from '$app/paths';
	import Code from '$lib/Code.svelte';
	import Demo from '$lib/Demo.svelte';

	const mount = `import { createEditor } from '@arcflow/editor';

const editor = createEditor('#editor', {
	steps,                       // a registry, or packs / step definitions
	flow,                        // flow JSON (optional)
	theme: 'auto',               // or { mode, colors, radius, nodeWidth, … }
	ui: { minimap: true },
	labels: { testRun: 'Dry run' },
	onChange: (flow) => save(flow)
});`;

	const svelte = `<script lang="ts">
	import { FlowEditor } from '@arcflow/editor/svelte';
<\/script>

<FlowEditor steps={registry} {flow} onChange={save} />`;

	const theme = `createEditor('#editor', {
	steps,
	theme: {
		mode: 'dark',
		colors: { accent: '#c084fc', radius: 14 },
		nodeWidth: 260
	}
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

<Code code={mount} />
<p>The container needs a height; the editor fills it. In a Svelte app, import the component instead:</p>
<Code code={svelte} language="svelte" />

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

<h2>Theming</h2>
<p>Every colour is a CSS variable, set from the <code>theme</code> option or overridden in your own stylesheet. Every string is in <code>labels</code>.</p>
<Code code={theme} />

<h2>Server mode</h2>
<p>
	Give it a backend and the toolbar grows a flow list with Save and Activate, an executions panel with run history, a credential picker, and a Run button that
	runs on the server and streams events onto the canvas.
</p>
<Code code={server} />
<p>See <a href="{base}/server">Server</a> for the API behind it, and <a href="{base}/ai">AI and agents</a> for the prompt bar.</p>
