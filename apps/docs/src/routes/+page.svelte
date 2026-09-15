<script lang="ts">
	import { base } from '$app/paths';
	import Code from '$lib/Code.svelte';
	import Demo from '$lib/Demo.svelte';
	import { createDemoFlow } from '$lib/demo-flow.js';

	const install = `npm install @arcflow/core @arcflow/editor`;

	const shape = `const flow = steps.flow('Monthly payroll');
const start = flow.add('trigger.schedule', { cron: '0 9 1 * *' });
const check = flow.add('logic.if', { conditions: [{ left: '{{ steps.runway.output.months }}', operator: 'gte', right: 6 }] });

start.to(check);
check.on('true').to(pay);
check.on('false').to(hold);`;
</script>

<svelte:head><title>arcflow — flows in code, JSON, a canvas or a prompt</title></svelte:head>

<h1>Automations in code, JSON, a canvas — or a prompt</h1>
<p class="lede">
	arcflow is a typed flow engine with an n8n-style editor on top. You define steps once; the same definition gives you TypeScript types, runtime validation,
	a form on the canvas and a catalog a model can build against. Everything in between is plain JSON.
</p>

<Code code={install} language="sh" />

<Demo flow={createDemoFlow()} storageKey="arcflow:docs-demo" ui={{ inspector: false }} />
<p class="caption">
	A real editor, running in this page. Drag a step in, connect it, press <strong>Test run</strong> — nothing is sent, every step reports what it would do.
</p>

<h2>Define a step once</h2>
<p>
	The <code>f.*</code> schema is the single source of truth: <code>ctx.config</code> is typed from it, untrusted JSON is validated against it with paths, the
	editor renders a form from it, and models get JSON Schema and a Markdown catalog.
</p>
<Code code={shape} />

<h2>What is in the box</h2>
<table>
	<thead><tr><th>Package</th><th></th></tr></thead>
	<tbody>
		<tr><td><code>@arcflow/core</code></td><td>The engine: steps, flows, validation, expressions, branching, loops, waits, sub-flows. No dependencies.</td></tr>
		<tr><td><code>@arcflow/nodes</code></td><td>Standard steps: triggers, HTTP, sandboxed JavaScript, set fields, if, switch, merge, loop, wait, run flow.</td></tr>
		<tr><td><code>@arcflow/editor</code></td><td>The canvas. One ES module with styles included, framework-free, themed with CSS variables.</td></tr>
		<tr><td><code>@arcflow/server</code></td><td>Webhooks, schedules, restart-safe timers, run history, encrypted credentials, live events.</td></tr>
		<tr><td><code>@arcflow/ai</code></td><td>Build and change flows with a model, validated and repaired until they hold.</td></tr>
		<tr><td><code>@arcflow/mcp</code></td><td>An MCP server so agents can list steps, write flows, test them and run them.</td></tr>
	</tbody>
</table>

<h2>Start somewhere</h2>
<ul>
	<li><a href="{base}/quick-start">Quick start</a> — build a flow, run it, open it on a canvas.</li>
	<li><a href="{base}/flows">Flows and steps</a> — the format, the schema, expressions, what the engine handles.</li>
	<li><a href="{base}/editor">Editor</a> — embedding, theming, shortcuts, server mode.</li>
	<li><a href="{base}/server">Server</a> — one command to run flows for real.</li>
	<li><a href="{base}/ai">AI and agents</a> — the prompt bar, the repair loop, MCP.</li>
</ul>

<style>
	.lede {
		font-size: 18px;
		line-height: 1.55;
	}

	.caption {
		margin-top: -14px;
		font-size: 13.5px;
		color: var(--text-muted);
	}
</style>
