<script lang="ts">
	import { base } from '$app/paths';
	import Code from '$lib/Code.svelte';
	import Tabs from '$lib/Tabs.svelte';
	import { mounting } from '$lib/frameworks';

	const install = `npm install @arcsig-labs/core @arcsig-labs/nodes`;

	const first = `import { createRegistry } from '@arcsig-labs/core';
import { standardSteps } from '@arcsig-labs/nodes';

const steps = createRegistry([standardSteps]);

const flow = steps.flow('Daily digest');
const start = flow.add('trigger.schedule', { cron: '0 9 * * *' });
const fetchTodos = flow.add('http.request', { url: 'https://example.com/todos' }, { id: 'fetch' });
const tell = flow.add('http.request', {
	method: 'POST',
	url: 'https://hooks.example.com/digest',
	body: { text: '{{ steps.fetch.output.body | length }} open items' }
});

start.to(fetchTodos);
fetchTodos.to(tell);

const json = flow.build(); // plain JSON: store it, edit it, send it anywhere`;

	const run = `import { createEngine } from '@arcsig-labs/core';

const engine = createEngine(steps);
const result = await engine.start(json, { mode: 'simulate' }); // the POST is held back
console.log(result.status, result.steps);`;

	const editor = `npm install @arcsig-labs/editor`;


	const server = `ARCFLOW_SECRET="a long random string" npx -y -p @arcsig-labs/server -p @arcsig-labs/editor arcflow dev`;
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
	In <code>simulate</code> mode, a step that defines a <code>simulate</code> handler reports what it would do instead of doing it. The HTTP step sends
	<code>GET</code> and <code>HEAD</code> requests and only pretends for the others, so here the fetch goes out and the <code>POST</code> does not. A step
	without a handler runs normally — give anything that sends, pays or writes one. Swap the mode for <code>live</code> when you mean it.
</p>
<Code code={run} />

<h2>4. Put it on a canvas</h2>
<Code code={editor} language="sh" />
<Tabs tabs={mounting} />
<p>
	The container needs a height; the editor fills it. Everything it produces is the same flow JSON you just built in code — see <a href="{base}/editor">Editor</a>.
</p>

<h2>5. Run it for real</h2>
<p>
	The server adds webhooks, cron schedules, timers that survive restarts, run history and encrypted credentials — and serves the editor on the same address.
</p>
<Code code={server} language="sh" />
<p>Open <code>http://127.0.0.1:8787</code> and the editor is there, with your steps and your runs. See <a href="{base}/server">Server</a>.</p>
