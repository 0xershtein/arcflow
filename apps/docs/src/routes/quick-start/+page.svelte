<script lang="ts">
	import Code from '$lib/Code.svelte';

	const install = `npm install @arcflow/core @arcflow/nodes`;

	const first = `import { createRegistry } from '@arcflow/core';
import { standardSteps } from '@arcflow/nodes';

const steps = createRegistry([standardSteps]);

const flow = steps.flow('Daily digest');
const start = flow.add('trigger.schedule', { cron: '0 9 * * *' });
const fetchTodos = flow.add('http.request', { url: 'https://example.com/todos' });
const tell = flow.add('http.request', {
	method: 'POST',
	url: 'https://hooks.example.com/digest',
	body: { text: '{{ steps.fetch.output.body | length }} open items' }
});

start.to(fetchTodos);
fetchTodos.to(tell);

const json = flow.build(); // plain JSON: store it, edit it, send it anywhere`;

	const run = `import { createEngine } from '@arcflow/core';

const engine = createEngine(steps);
const result = await engine.start(json, { mode: 'simulate' }); // nothing is sent
console.log(result.status, result.steps);`;

	const editor = `npm install @arcflow/editor`;

	const editorCode = `import { createEditor } from '@arcflow/editor';
import { createRegistry } from '@arcflow/core';
import { standardSteps } from '@arcflow/nodes';

createEditor('#editor', {
	steps: createRegistry([standardSteps]),
	flow: json,
	onChange: (flow) => save(flow)
});`;

	const server = `ARCFLOW_SECRET="a long random string" npx arcflow dev`;
</script>

<svelte:head><title>Quick start — arcflow</title></svelte:head>

<h1>Quick start</h1>
<p>Three things you can do in about five minutes: build a flow in code, run it, and open it on a canvas.</p>

<h2>1. Install</h2>
<Code code={install} language="sh" />

<h2>2. Build a flow</h2>
<p>
	Steps are typed definitions. The builder only accepts settings and output ports that exist, so a flow that compiles is a flow that runs.
</p>
<Code code={first} />

<h2>3. Run it</h2>
<p>
	<code>simulate</code> mode never sends a request or moves money — every step reports what it would do. Swap it for <code>live</code> when you mean it.
</p>
<Code code={run} />

<h2>4. Put it on a canvas</h2>
<Code code={editor} language="sh" />
<Code code={editorCode} />
<p>
	The container needs a height; the editor fills it. Everything it produces is the same flow JSON you just built in code — see <a href="/editor">Editor</a>.
</p>

<h2>5. Run it for real</h2>
<p>
	The server adds webhooks, cron schedules, timers that survive restarts, run history and encrypted credentials — and serves the editor on the same address.
</p>
<Code code={server} language="sh" />
<p>Open <code>http://127.0.0.1:8787</code> and the editor is there, with your steps and your runs. See <a href="/server">Server</a>.</p>
