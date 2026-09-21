<script lang="ts">
	import { base } from '$app/paths';
	import Code from '$lib/Code.svelte';
	import Demo from '$lib/Demo.svelte';
	import { createDemoFlow } from '$lib/demo-flow.js';

	const install = `npm install @arcsig-labs/core @arcsig-labs/editor`;

	/** The definition the four panels below are produced from — nothing here is illustrative. */
	const definition = `import { defineNode, f } from '@arcsig-labs/core';
import { postMessage } from './slack.js';

export const slackPost = defineNode({
	kind: 'slack.post',
	title: 'Post to Slack',
	description: 'Posts a message to a channel and outputs its timestamp.',
	config: {
		channel: f.string({ label: 'Channel', placeholder: '#treasury' }),
		text: f.text({ label: 'Message', placeholder: 'Payroll of {{ input.amount }} USDC is ready' }),
		urgent: f.boolean({ default: false, label: 'Ping the channel' })
	},
	outputs: [{ id: 'out' }, { id: 'error', label: 'Error' }],
	run: async (ctx) => ({ output: { ts: await postMessage(ctx.config) } })
});`;

	const types = `ctx.config.channel; // string
ctx.config.urgent;  // boolean
ctx.config.chanel;
// error TS2551: Property 'chanel' does not exist on type
// '{ channel: string; text: string; urgent: boolean; }'. Did you mean 'channel'?`;

	const validation = `{
	"level": "error",
	"code": "required",
	"path": "nodes[1].config.channel",
	"message": "Post to Slack: Channel is required.",
	"nodeId": "notify"
}`;

	const form = `{
	"channel": { "kind": "string", "label": "Channel", "placeholder": "#treasury" },
	"text": { "kind": "string", "multiline": true, "label": "Message",
	          "placeholder": "Payroll of {{ input.amount }} USDC is ready" },
	"urgent": { "kind": "boolean", "default": false, "label": "Ping the channel" }
}`;

	const catalog = `### \`slack.post\` — Post to Slack
Posts a message to a channel and outputs its timestamp.
- Outputs: \`out\`, \`error\`
- Config:
  - \`channel\`: text — Channel
  - \`text\`: text (multi-line) — Message
  - \`urgent\`: true | false, default false — Ping the channel`;

	const mcp = `claude mcp add arcflow -- npx -y @arcsig-labs/mcp`;

	const session = `list_steps            → 39 entries, 7 042 characters
validate_flow         → error required @ nodes[1].config.url
validate_flow (fixed) → 0 issues
test_flow             → failed · GET example.com/status returned 404 Not Found`;

	const outputs = [
		{ id: 'types', title: 'The types', body: 'Inside `run`, the config is the definition. A typo is a compile error, not a run-time surprise.', code: types, language: 'ts' },
		{ id: 'validation', title: 'The validation', body: 'Untrusted JSON — from a file, an API or a model — comes back with a stable code and a JSON path.', code: validation, language: 'json' },
		{ id: 'form', title: 'The form', body: 'The canvas builds the inspector from the same fields: labels, placeholders, controls, defaults.', code: form, language: 'json' },
		{ id: 'catalog', title: 'The catalog', body: 'And a model reads this, so it writes flows against what exists instead of guessing.', code: catalog, language: 'md' }
	];
</script>

<svelte:head><title>arcflow — a flow engine your users can see and your model can write</title></svelte:head>

<section class="hero">
	<div class="pitch">
		<h1>A flow engine your users can see and your model can write.</h1>
		<p class="lede">
			Define a step once. arcflow gives you the TypeScript types, the runtime validation, the form on the canvas, and the catalog a model builds against —
			from that one definition. Everything in between is plain JSON.
		</p>
		<div class="install">
			<Code code={install} language="sh" />
		</div>
		<div class="actions">
			<a class="btn primary" href="{base}/quick-start">Quick start</a>
			<a class="btn" href="https://github.com/arcsig-labs/arcflow">GitHub</a>
		</div>
	</div>

	<aside class="status" aria-label="Project status">
		<p class="now"><span class="mark" aria-hidden="true"></span>0.1.0, released 2026-09-21</p>
		<p>
			The packages are on npm under <code>@arcsig-labs</code>, so that command works as written. To run everything from source instead:
			<a href="https://github.com/arcsig-labs/arcflow">clone the repository</a>, then <code>pnpm install</code> and <code>pnpm dev</code>.
		</p>
		<dl>
			<div><dt>License</dt><dd>MIT</dd></div>
			<div><dt>Tests</dt><dd>318, across 26 files</dd></div>
			<div><dt>Dependencies</dt><dd>none in the engine</dd></div>
		</dl>
	</aside>
</section>

<section class="mechanism">
	<h2>One definition</h2>
	<p class="measure">
		A step is a kind, a config schema and a <code>run</code>. That is the whole contract, and the four things under it are generated from it — which is why
		the canvas, the validator, the compiler and the model can never disagree about what a step takes.
	</p>
	<div class="source">
		<Code code={definition} />
	</div>

	<svg class="fan" viewBox="0 0 1200 40" preserveAspectRatio="none" aria-hidden="true">
		<path d="M600 0v16H300v24M600 16h300v24" pathLength="1" vector-effect="non-scaling-stroke" />
	</svg>

	<div class="outputs">
		{#each outputs as output (output.id)}
			<article>
				<h3>{output.title}</h3>
				<p>{@html output.body.replace(/`([^`]+)`/g, '<code>$1</code>')}</p>
				<Code code={output.code} language={output.language} />
			</article>
		{/each}
	</div>
</section>

<section class="canvas">
	<h2>The canvas is the same flow</h2>
	<p class="measure">
		This is the editor itself, running in this page — not a screenshot. Drag a step in, connect it, press <strong>Test run</strong>: steps with a test mode
		report what they would do, and the HTTP step really sends its <code>GET</code> to the GitHub API, since test runs only hold back other methods.
		Whatever you build here is the same JSON the engine runs.
	</p>
	<Demo flow={createDemoFlow()} />
	<p class="measure caption">
		Step shapes, themes, a compact toolbar, translated labels, read-only and a narrow container, on one editor: <a href="{base}/editor#playground"
			>open the playground</a
		>.
	</p>
</section>

<section class="agents">
	<h2>Built to be driven by a model</h2>
	<p class="measure">
		The catalog, the validator and the simulated run are the same three things an agent needs. Add arcflow to a coding agent and it has them over MCP —
		four tools on its own, nine against a running server.
	</p>
	<Code code={mcp} language="sh" />
	<p class="measure">A session recorded from this repository, start to finish:</p>
	<Code code={session} language="sh" />
	<p class="measure caption">
		Every validation issue carries the path that caused it, which is what lets a model repair its own output instead of starting over. <a href="{base}/ai"
			>AI and agents</a
		> has the generate, edit and repair loop.
	</p>
</section>

<section class="box">
	<h2>What is in the box</h2>
	<table>
		<thead><tr><th>Package</th><th>What it is</th></tr></thead>
		<tbody>
			<tr><td><code>@arcsig-labs/core</code></td><td>The engine: steps, flows, validation, expressions, branching, loops, waits, sub-flows. No dependencies.</td></tr>
			<tr><td><code>@arcsig-labs/nodes</code></td><td>Thirteen standard steps: triggers, HTTP, sandboxed JavaScript, set fields, if, switch, merge, loop, wait, run flow.</td></tr>
			<tr><td><code>@arcsig-labs/editor</code></td><td>The canvas. One ES module with styles included, framework-free, 19 colour tokens, 151 replaceable strings.</td></tr>
			<tr><td><code>@arcsig-labs/server</code></td><td>Webhooks, schedules, restart-safe timers, run history, encrypted credentials, live events.</td></tr>
			<tr><td><code>@arcsig-labs/ai</code></td><td>Build and change flows with a model: every attempt is validated, and the issues go back for repair for a set number of tries.</td></tr>
			<tr><td><code>@arcsig-labs/mcp</code></td><td>An MCP server, so agents list steps, write flows, check them and run them.</td></tr>
		</tbody>
	</table>
</section>

<section class="start">
	<h2>Start somewhere</h2>
	<ul>
		<li><a href="{base}/quick-start">Quick start</a> — build a flow, run it, open it on a canvas.</li>
		<li><a href="{base}/flows">Flows and steps</a> — the format, the schema, expressions, what the engine handles.</li>
		<li><a href="{base}/editor">Editor</a> — embedding in React, Vue or Svelte, theming, shortcuts, server mode.</li>
		<li><a href="{base}/server">Server</a> — one command to run flows for real.</li>
		<li><a href="{base}/ai">AI and agents</a> — the prompt bar, the repair loop, MCP.</li>
	</ul>
</section>

<style>
	/* ---------- Hero ---------- */

	.hero {
		display: grid;
		grid-template-columns: minmax(0, 7fr) minmax(0, 5fr);
		gap: 48px;
		align-items: start;
		padding-bottom: 12px;
	}

	h1 {
		max-width: 26ch;
		font-size: clamp(36px, 4.4vw, 56px);
		line-height: 1.04;
		letter-spacing: -0.035em;
		text-wrap: balance;
	}

	.lede {
		max-width: 62ch;
		margin: 20px 0 26px;
		font-size: 18px;
		line-height: 1.55;
		color: var(--text-soft);
	}

	.install :global(.code) {
		margin-bottom: 18px;
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
	}

	.btn {
		display: inline-flex;
		align-items: center;
		height: 42px;
		padding: 0 20px;
		border: 1px solid var(--line-strong);
		border-radius: 9px;
		font-size: 15px;
		font-weight: 550;
		color: var(--text);
		text-decoration: none;
		transition: background-color 0.18s cubic-bezier(0.16, 1, 0.3, 1), border-color 0.18s cubic-bezier(0.16, 1, 0.3, 1);
	}

	.btn:hover {
		background: var(--surface-2);
	}

	.btn.primary {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--accent-ink);
	}

	.btn.primary:hover {
		filter: brightness(1.08);
	}

	/* The honest half of the fold: quieter than the pitch, never hidden. */
	.status {
		padding: 22px 22px 6px;
		border: 1px solid var(--line);
		border-radius: 12px;
		background: var(--surface-2);
		font-size: 14px;
	}

	.status p {
		margin: 0 0 12px;
		font-size: 14px;
		line-height: 1.5;
	}

	.status :global(code) {
		white-space: nowrap;
	}

	.status .now {
		display: flex;
		align-items: center;
		gap: 9px;
		font-weight: 600;
		color: var(--text);
		font-variant-numeric: tabular-nums;
	}

	.mark {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--accent);
		flex: none;
	}

	.status dl {
		margin: 0;
		border-top: 1px solid var(--line);
	}

	.status dl div {
		display: flex;
		justify-content: space-between;
		gap: 16px;
		padding: 9px 0;
		border-bottom: 1px solid var(--line);
	}

	.status dt {
		color: var(--text-muted);
	}

	.status dd {
		margin: 0;
		text-align: right;
		font-variant-numeric: tabular-nums;
	}

	/* ---------- Sections ---------- */

	section {
		padding: 56px 0;
		border-top: 1px solid var(--line);
	}

	.hero {
		padding-top: 8px;
		border-top: 0;
	}

	.measure {
		max-width: 70ch;
	}

	section > :global(h2:first-child) {
		margin-top: 0;
	}

	.caption {
		font-size: 14px;
		color: var(--text-muted);
	}

	/* ---------- One definition, four outputs ---------- */

	.source {
		margin-top: 24px;
	}

	.source :global(.code) {
		margin-bottom: 0;
	}

	/* The one authored moment: the definition reaching down into the four things it yields. */
	.fan {
		display: block;
		width: 100%;
		height: 40px;
		fill: none;
		stroke: var(--line-strong);
		stroke-width: 1;
	}

	.fan path {
		stroke-dasharray: 1;
		animation: reach 1s cubic-bezier(0.16, 1, 0.3, 1) both;
	}

	@keyframes reach {
		from {
			stroke-dashoffset: 1;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.fan path {
			animation: none;
			stroke-dasharray: none;
		}
	}

	.outputs {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 1px;
		background: var(--line);
		border: 1px solid var(--line);
		border-radius: 12px;
		overflow: hidden;
	}

	.outputs article {
		padding: 22px;
		background: var(--bg);
	}

	.outputs h3 {
		margin: 0 0 6px;
		font-size: 15px;
	}

	.outputs p {
		margin: 0 0 14px;
		max-width: 46ch;
		font-size: 14px;
		line-height: 1.5;
	}

	.outputs :global(.code) {
		margin-bottom: 0;
		--code-bg: var(--surface-2);
	}

	.outputs :global(pre) {
		padding: 13px 15px;
		font-size: 12.5px;
	}

	/* ---------- Canvas ---------- */

	.canvas :global(.demo) {
		margin-top: 24px;
		margin-bottom: 0;
	}

	.agents :global(.code):first-of-type {
		margin-top: 22px;
	}

	.box table {
		margin-top: 22px;
		margin-bottom: 0;
	}

	.start ul {
		margin-top: 18px;
		margin-bottom: 0;
	}

	@media (max-width: 900px) {
		.hero {
			grid-template-columns: minmax(0, 1fr);
			gap: 32px;
		}

		.outputs {
			grid-template-columns: minmax(0, 1fr);
		}

		.fan {
			height: 24px;
			background: linear-gradient(var(--line-strong), var(--line-strong)) center / 1px 100% no-repeat;
		}

		.fan path {
			display: none;
		}

		section {
			padding: 40px 0;
		}
	}
</style>
