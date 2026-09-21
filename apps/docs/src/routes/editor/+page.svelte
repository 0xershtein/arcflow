<script lang="ts">
	import { base } from '$app/paths';
	import Code from '$lib/Code.svelte';
	import HeaderDemo from '$lib/HeaderDemo.svelte';
	import Playground from '$lib/Playground.svelte';
	import Tabs from '$lib/Tabs.svelte';
	import VarsDemo from '$lib/VarsDemo.svelte';
	import { mounting } from '$lib/frameworks';

	const control = `editor.getFlow();                  // Flow
editor.getIssues();                // Issue[]
await editor.setFlow(json);        // { loaded, issues }
editor.setOptions({ theme: 'dark', readonly: true, labels: { testRun: 'Dry run' } });
editor.undo();
editor.redo();
await editor.run();                // Test run: simulated
await editor.runOnServer();        // with a backend: the real thing
editor.destroy();`;

	const theme = `createEditor('#editor', {
	steps,
	theme: {
		mode: 'auto',
		colors: { accent: '#c084fc', accentSoft: 'rgba(192, 132, 252, 0.16)' },
		dark: { background: '#0b0b10' },
		fontFamily: 'Inter, system-ui, sans-serif',
		monoFontFamily: 'JetBrains Mono, monospace',
		fontSize: 14,
		radius: 14,
		nodeWidth: 260
	}
});`;

	const labelsCode = `import { defaultLabels } from '@arcsig-labs/editor';

Object.keys(defaultLabels); // every string, with its default

createEditor('#editor', {
	steps,
	labels: { testRun: 'Çalıştır', searchSteps: 'Adım ara', emptyTitle: 'Bir tetikleyiciyle başla' }
});`;

	const brand = `<FlowEditor steps={registry} {flow} ui={{ toolbar: { name: false, testRun: false }, testRun: true }}>
	{#snippet brand()}<strong>Payouts</strong>{/snippet}
</FlowEditor>`;

	const stripCode = `createEditor('#editor', {
	steps,
	flow,
	ui: {
		toolbar: { name: false, json: false, importExport: false, flows: false, executions: false, run: false, testRun: false },
		palette: false
	}
});

hostTestRunButton.onclick = () => editor.run(); // hiding a button never disables what it did`;

	const heightCode = `#editor { height: 100vh; }          /* or a px height, or height: 100% inside a sized parent */
.column { display: flex; flex-direction: column; min-height: 100vh; }
.column #editor { flex: 1; min-height: 0; }   /* min-height: 0, or the palette grows the row */`;

	const attribution = `createEditor('#editor', { steps, ui: { attribution: 'bottom-left' } });

/* and, in your stylesheet, how far it sits from the canvas edge */
.fb-root { --fb-attribution-offset: 14px; }`;

	const server = `import { createEditor, createHttpBackend } from '@arcsig-labs/editor';

createEditor('#editor', {
	steps,
	backend: createHttpBackend('http://localhost:8787', { apiKey })
});`;

	const devCmd = `ARCFLOW_SECRET="a long random string" npx -y -p @arcsig-labs/server -p @arcsig-labs/editor arcflow dev`;
	const aiCmd = `ANTHROPIC_API_KEY=sk-... ARCFLOW_SECRET="a long random string" npx -y -p @arcsig-labs/server -p @arcsig-labs/editor arcflow dev`;
</script>

<svelte:head><title>Editor — arcflow</title></svelte:head>

<h1>Editor</h1>
<p>
	One ES module with its styles included. It works with any framework or none, takes flow JSON in and gives flow JSON back, and never assumes your steps —
	the palette, the forms and the validation all come from the registry you pass. The editor carries no branding: its default look is neutral grey with
	system fonts, and every colour, font, radius and string is an option.
</p>

<h2 id="playground">Playground</h2>
<p>
	One editor, running the <a href="{base}/flows#standard-steps">standard steps</a> in this page. Each switch changes its options in place — what
	<code>editor.setOptions()</code> does — so the canvas, the selection and the undo history survive. The code under it is the exact set of options that
	produces what you see.
</p>
<Playground />
<p>
	<strong>Test run</strong> really calls the GitHub API: the HTTP step sends <code>GET</code> and <code>HEAD</code> requests in test runs and only pretends
	for the others. After a run, click a step and open <strong>Input</strong> or <strong>Output</strong>. On a phone the editor is already in its one-column
	layout; on a wide screen, pick <strong>420px</strong> to see it fold. Look sets <code>theme.colors</code>, <code>radius</code> and, for Serif, <code>fontFamily</code>.
</p>

<h2>Mounting</h2>
<Tabs tabs={mounting} />
<p>
	The container needs a height; the editor fills it. Svelte is an optional peer dependency — only the <code>/svelte</code> entry needs it installed, because
	the default entry has Svelte compiled in. Create the editor once and push later changes through <code>setOptions</code>: recreating it costs the canvas, the
	selection and the undo history. <code>steps</code> is the one option fixed for the life of an instance.
</p>

<h2>Options</h2>
<p>Sixteen options. Everything except <code>steps</code>, <code>backend</code> and the callbacks is plain JSON.</p>
<table>
	<thead><tr><th>Option</th><th></th></tr></thead>
	<tbody>
		<tr><td><code>steps</code></td><td>A registry from <code>createRegistry</code>, or packs and step definitions. Fixed for the life of the instance.</td></tr>
		<tr><td><code>flow</code></td><td>Flow JSON (object or string) to show. A different object reloads the canvas; positions are optional.</td></tr>
		<tr><td><code>theme</code></td><td><code>'light' | 'dark' | 'auto'</code>, or <code>mode</code>, <code>colors</code>, <code>light</code>, <code>dark</code>, <code>fontFamily</code>, <code>monoFontFamily</code>, <code>fontSize</code>, <code>radius</code>, <code>nodeWidth</code>. Default <code>auto</code>.</td></tr>
		<tr><td><code>ui</code></td><td>Parts of the interface: <code>toolbar</code>, <code>palette</code>, <code>inspector</code>, <code>testRun</code>, <code>json</code>, <code>importExport</code>, <code>flows</code>, <code>executions</code>, <code>ai</code>, <code>controls</code>, <code>minimap</code>, <code>background</code>, <code>attribution</code>, <code>node</code>. A flag hides interface, not behaviour.</td></tr>
		<tr><td><code>labels</code></td><td>Replace or translate any of the 151 interface strings.</td></tr>
		<tr><td><code>readonly</code></td><td>View only: no adding, moving, connecting or editing.</td></tr>
		<tr><td><code>storageKey</code></td><td>Autosave to <code>localStorage</code> under this key and restore on load.</td></tr>
		<tr><td><code>services</code></td><td>Handed to steps during a Test run in the browser.</td></tr>
		<tr><td><code>vars</code></td><td>Run variables for the editor's runs, never written into the flow.</td></tr>
		<tr><td><code>summaries</code></td><td>Replace what a step says it will do on the canvas, by kind.</td></tr>
		<tr><td><code>runStepDelay</code></td><td>Pause between steps in a Test run, so it is watchable. Default 450 ms.</td></tr>
		<tr><td><code>backend</code></td><td>A flow server: open, save, activate, run for real, browse past runs.</td></tr>
		<tr><td><code>onChange</code></td><td>The flow after every edit (debounced).</td></tr>
		<tr><td><code>onValidate</code></td><td>The problems whenever they change, and once on load.</td></tr>
		<tr><td><code>onSelect</code></td><td>The selected step id, or <code>null</code>.</td></tr>
		<tr><td><code>onRun</code></td><td>Each Test run event.</td></tr>
	</tbody>
</table>
<p><code>createEditor</code> returns a handle:</p>
<Code code={control} />
<p>
	The Svelte component takes the same options as props, plus one of its own: <code>brand</code>, a snippet for the left of the toolbar. Its methods
	(<code>getFlow</code>, <code>getIssues</code>, <code>load</code>, <code>run</code>, <code>undo</code>, …) are reached through <code>bind:this</code>.
</p>

<h2>Test run and Run</h2>
<p>
	<strong>Test run</strong> runs the flow in <code>simulate</code> mode: a step that defines a <code>simulate</code> handler reports what it
	<em>would</em> do instead of doing it. A step without one runs its normal code — that is what makes a test run useful for conditions, set-fields and your
	own pure steps — so the run log says <em>“Simulated — steps without a test mode still run”</em> rather than promising that nothing happened. Give any step
	that sends, pays or writes a <code>simulate</code> handler.
</p>
<p>
	<strong>Run</strong> exists in server mode only: it saves the flow and runs it on the server for real. The log is titled <em>Run</em>, says
	<em>“Ran on the server”</em>, and wears the <code>live</code> colour, so a real run never looks like a rehearsal. The log docks under the canvas rather than
	over it and follows the newest event unless you have scrolled up.
</p>
<p>
	A flow started by a webhook or a schedule has no payload when you press either button. Give the trigger a <strong>Test body</strong> (<code>sample</code>)
	and both runs start from it, so <code>{'{{ trigger.body.total }}'}</code> resolves to something.
</p>

<h2>Run data</h2>
<p>
	After a test run, each step's <strong>Input</strong> and <strong>Output</strong> are there as a JSON tree — per loop iteration too. Drag any value onto a
	field to insert the expression for it, or type <code>{'{{'}</code> in a field to pick from what actually ran, with a live preview underneath. Try it in the
	<a href="#playground">playground</a>: press Test run, select <em>Is it up?</em> and open <strong>Input</strong> — that is the GitHub API's answer, which its code reads as
	<code>input.status</code>.
</p>

<h2>Run variables and summaries</h2>
<p>
	<code>vars</code> hands the editor the host's numbers for its runs, readable as <code>{'{{ vars.balance }}'}</code>. They are merged in when a run starts —
	over the flow's own <code>vars</code>, which are over the step pack's <code>sampleVars</code> — and never written into the flow you save.
	<code>summaries</code> replaces the line a step shows on the canvas, by kind; the step's own summary stays the fallback, and a summary that throws falls
	back to it. Switch the balance, press Test run, and a different branch runs.
</p>
<VarsDemo />

<h2>Your own header</h2>
<p>
	A host with a header of its own usually wants the canvas without a second name field. <code>ui.toolbar</code> takes <code>true</code>,
	<code>false</code>, or the parts to keep: <code>name</code>, <code>status</code>, <code>undo</code>, <code>note</code>, <code>json</code>,
	<code>importExport</code>, <code>flows</code>, <code>executions</code>, <code>run</code> and <code>testRun</code>. A part that has a <code>ui</code> option
	of its own shows when both are on. Once <code>name</code> is off and no labelled button is left, the toolbar shrinks from 56px to a 40px strip with the
	problem badge, undo/redo and Note. Here the header and its Test run button belong to the host page:
</p>
<HeaderDemo />
<Code code={stripCode} />
<p>
	In Svelte, the <code>brand</code> snippet stands where the name field was — pick <em>Brand</em> under Toolbar in the <a href="#playground">playground</a>
	to see it:
</p>
<Code code={brand} language="svelte" />

<h2>Editing</h2>
<ul>
	<li>Hover a connection and press <strong>+</strong> to insert a step; later steps move right to make room.</li>
	<li>Drag a connection into empty space (or click an output) to add a connected step.</li>
	<li>Copy, cut and paste selections as flow JSON — pasting also accepts <code>{'{ nodes, edges }'}</code> from a model, with ids and <code>{'{{ steps.… }}'}</code> references rewritten.</li>
	<li>Undo and redo, duplicate, multi-select with a box (Shift-drag) or Shift/⌘-click.</li>
	<li>
		Sticky notes: <strong>Note</strong> adds one; double-click to edit, drag the corners to resize. They are saved as <code>annotations</code> in the flow
		JSON and ignored when it runs — the playground's flow has one.
	</li>
	<li>
		A step that runs another flow (<code>flow.call</code>, or any type that declares <code>subflow</code>) opens it: the canvas swaps to the called flow and a
		band above it leads back out. Needs a <code>backend</code>, and unsaved changes stop the move rather than being lost to it.
	</li>
</ul>
<table>
	<thead><tr><th>Shortcut</th><th></th></tr></thead>
	<tbody>
		<tr><td><code>⌘Z</code> / <code>Ctrl+Z</code></td><td>Undo</td></tr>
		<tr><td><code>⇧⌘Z</code> / <code>Ctrl+Y</code></td><td>Redo</td></tr>
		<tr><td><code>⌘C</code>, <code>⌘X</code>, <code>⌘V</code></td><td>Copy, cut, paste</td></tr>
		<tr><td><code>⌘D</code>, <code>⌘A</code></td><td>Duplicate, select all</td></tr>
		<tr><td><code>Backspace</code> / <code>Delete</code></td><td>Delete the selection</td></tr>
		<tr><td><code>Esc</code></td><td>Close the picker, clear the selection</td></tr>
	</tbody>
</table>
<p>Shortcuts apply to the editor that was clicked last, and never while typing in a field.</p>

<h2>Step shapes</h2>
<p>
	<code>ui.node</code> picks how a step is drawn. All three read the same flow and keep the same handles, so switching is safe on a flow that already has
	positions — try them in the <a href="#playground">playground</a>.
</p>
<table>
	<tbody>
		<tr><td><code>card</code></td><td>Default. A full card: category, name, what the step will do, and any port labels inside it.</td></tr>
		<tr><td><code>tile</code></td><td>A square of icon with the name and summary underneath, and port labels beside the square. Closest to n8n.</td></tr>
		<tr><td><code>compact</code></td><td>One row — icon and name only. Fits a lot of steps on screen.</td></tr>
	</tbody>
</table>

<h2>Theming</h2>
<p>
	Every colour is a <code>--fb-*</code> CSS variable on the editor's root, set from the <code>theme</code> option. <code>colors</code> applies to both modes;
	<code>light</code> and <code>dark</code> override the same names for one mode only.
</p>
<Code code={theme} />
<p>Nineteen names cover the whole editor:</p>
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
		<tr><td><code>live</code></td><td>Runs that really happened: the Run log's frame, badge and rows.</td></tr>
		<tr><td><code>liveSoft</code></td><td>The translucent background behind <code>live</code>.</td></tr>
		<tr><td><code>danger</code></td><td>Errors: text, borders, icons.</td></tr>
		<tr><td><code>dangerSoft</code></td><td>The background behind an error.</td></tr>
		<tr><td><code>edge</code></td><td>Connection lines.</td></tr>
		<tr><td><code>grid</code></td><td>The canvas dot or line pattern.</td></tr>
	</tbody>
</table>

<h2>Text</h2>
<p>
	Every string the editor can show is in <code>labels</code> — 151 of them, from button captions to the empty-canvas hint to validation wording. Pass the ones
	you want to change and the rest keep their defaults; <code>{'{name}'}</code> and <code>{'{count}'}</code> placeholders are filled in at render time. An empty
	string drops the optional ones, such as the hints on an empty canvas. Step titles, descriptions and field labels are not in <code>labels</code>: they come
	from your step definitions, which is why they stay English when you pick <em>Deutsch</em> in the playground.
</p>
<Code code={labelsCode} />

<h2>Small containers</h2>
<p>
	The layout follows the width of the editor's own container, not the window, so an editor in a side panel behaves like one on a phone. Below about 820px it
	becomes one column — the canvas with the open panel under it, the step list behind an <strong>Add step</strong> drawer, and the toolbar's secondary actions
	behind <strong>More</strong>. Below about 560px buttons keep their icons and drop their words. Nothing is removed; it folds, and stays usable down to about
	400px. The playground's <strong>420px</strong> switch shows it.
</p>

<h2>Height</h2>
<p>
	The editor fills its element, so that element needs a <strong>definite</strong> height — one the browser can resolve without measuring the content. A
	development build writes one console warning when the height came from the content.
</p>
<Code code={heightCode} language="css" />

<h2>Svelte Flow attribution</h2>
<p>
	The canvas carries a small “Svelte Flow” link in its corner. It belongs to <a href="https://svelteflow.dev">Svelte Flow</a>, the canvas library underneath,
	and showing it is a condition of using that library for free — so arcflow has no option to hide it. <code>ui.attribution</code> moves it to another corner
	(default <code>'bottom-right'</code>) and <code>--fb-attribution-offset</code> sets its distance from the edge.
</p>
<Code code={attribution} />

<h2>Server mode</h2>
<p>
	This part needs a running server, so it cannot be live on this static page. Give the editor a backend and the toolbar grows a flow list with Save and
	Activate, an Executions panel with run history, a credential picker, and a Run button that runs on the server and streams events onto the canvas. It opens
	the flow saved last, saves a flow with errors as a draft (only Activate insists on no errors), and asks the server what it has configured so missing
	features are off rather than failing when pressed.
</p>
<Code code={server} />
<figure class="shot">
	<img src="{base}/server-mode.jpg" alt="The editor served by arcflow dev: a toolbar with Executions, a flow list, Saved, Pause, Run and Test run, above the step list, a three-step flow and the inspector." width="1440" height="760" loading="lazy" />
	<figcaption>Captured from <code>arcflow dev</code> with one active flow and two past runs.</figcaption>
</figure>
<p>To try it on your machine, run the server and open <code>http://127.0.0.1:8787</code>:</p>
<Code code={devCmd} language="sh" />
<p>See <a href="{base}/server">Server</a> for the API behind it.</p>

<h2>Prompt bar</h2>
<p>
	The prompt bar needs a server with a model configured — an Anthropic API key on the server, never in the browser — so it does not appear on this page, and
	a server without a key shows no bar at all. With one, describe a flow and it is built and validated on the canvas; describe a change and it is applied to
	the open flow. Either way the result lands with <strong>Keep</strong> and <strong>Discard</strong>, on top of the normal undo history. With errors on the
	canvas the bar offers <strong>Fix problems</strong>, handing the model the issues and their paths; otherwise it offers <strong>Explain</strong>.
	<code>ui.ai: false</code> hides it.
</p>
<Code code={aiCmd} language="sh" />
<p>See <a href="{base}/ai">AI and agents</a> for the generate, edit and repair loop behind it.</p>

<style>
	.shot {
		margin: 0 0 24px;
	}

	.shot img {
		display: block;
		width: 100%;
		height: auto;
		border: 1px solid var(--line-strong);
		border-radius: 12px;
	}

	figcaption {
		margin-top: 8px;
		color: var(--text-muted);
		font-size: 13px;
	}
</style>
