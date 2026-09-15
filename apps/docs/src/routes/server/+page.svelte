<script lang="ts">
	import Code from '$lib/Code.svelte';

	const cli = `ARCFLOW_SECRET="a long random string" npx arcflow dev --db ./arcflow.db`;

	const embed = `import { createRegistry } from '@arcflow/core';
import { standardSteps } from '@arcflow/nodes';
import { createServer } from '@arcflow/server';
import { SqliteStorage, serveNode } from '@arcflow/server/node';

const server = await createServer({
	registry: createRegistry([standardSteps, myPack]),
	storage: new SqliteStorage('./arcflow.db'),
	secret: process.env.ARCFLOW_SECRET,
	services: { payments }    // your own services, handed to your steps
});

await serveNode(server, { port: 8787 });`;

	const webhook = `curl -X POST http://127.0.0.1:8787/hooks/new-signup -d '{"email":"a@b.com"}'`;
</script>

<svelte:head><title>Server — arcflow</title></svelte:head>

<h1>Server</h1>
<p>
	<code>@arcflow/server</code> runs flows for real: an HTTP API, webhook and cron triggers, timers that survive restarts, run history, encrypted credentials and
	live events. It is a <a href="https://hono.dev">Hono</a> app, so it runs on Node, Bun, Deno or an edge runtime, and storage is pluggable.
</p>

<h2>One command</h2>
<Code code={cli} language="sh" />
<p>
	<code>dev</code> also serves the editor on the same address, with your steps, credentials and run history — no build step and no API key in the browser.
	<code>serve</code> is the same without the editor.
</p>

<h2>In your own app</h2>
<Code code={embed} />

<h2>Triggers</h2>
<ul>
	<li><strong>Webhooks</strong> — an active flow with a <code>trigger.webhook</code> step answers at <code>/hooks/&lt;path&gt;</code>, immediately, when the run finishes, or with whatever a "respond" step sends.</li>
	<li><strong>Schedules</strong> — cron steps fire on their expression; runs missed while the server was down are not replayed.</li>
	<li><strong>Timers</strong> — a run paused by <code>logic.wait</code> is stored with a wake-up time and resumed later, also after a restart.</li>
</ul>
<Code code={webhook} language="sh" />

<h2>Credentials</h2>
<p>
	A <code>f.credential('http-auth')</code> field stores only an id in the flow. The value is encrypted with AES-256-GCM and resolved at run time into
	<code>ctx.secrets</code> — it never enters flow JSON, run state, or an API response.
</p>

<h2>API</h2>
<table>
	<thead><tr><th>Endpoint</th><th>What it does</th></tr></thead>
	<tbody>
		<tr><td><code>GET /api/steps</code></td><td>The catalog: config schemas, outputs, JSON Schema, a Markdown catalog for prompts, and a manifest a browser can rebuild a registry from</td></tr>
		<tr><td><code>GET/POST /api/flows</code>, <code>GET/PUT/DELETE /api/flows/:id</code></td><td>Flows and their versions</td></tr>
		<tr><td><code>POST /api/flows/:id/runs</code></td><td>Start a run, live or simulated</td></tr>
		<tr><td><code>GET /api/runs</code>, <code>GET /api/runs/:id</code></td><td>History and full run state</td></tr>
		<tr><td><code>POST /api/runs/:id/resume</code>, <code>/cancel</code></td><td>Answer a waiting step, or stop a run</td></tr>
		<tr><td><code>GET /api/runs/:id/events</code></td><td>Server-sent events for a live run</td></tr>
		<tr><td><code>/api/credentials</code></td><td>Write-only credential values</td></tr>
		<tr><td><code>/api/ai/generate</code>, <code>/edit</code>, <code>/explain</code></td><td>Flow generation, when a model is configured</td></tr>
	</tbody>
</table>
