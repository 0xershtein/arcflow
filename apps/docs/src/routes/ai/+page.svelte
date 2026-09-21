<script lang="ts">
	import Code from '$lib/Code.svelte';

	const generate = `import { anthropicModel, generateFlow } from '@arcsig-labs/ai';

const { ok, flow, issues, attempts } = await generateFlow({
	registry,
	model: anthropicModel(),          // ANTHROPIC_API_KEY
	prompt: 'Every Monday at 9, fetch open invoices and post a summary to our webhook'
});`;

	const edit = `import { editFlow, summarizeChanges } from '@arcsig-labs/ai';

const result = await editFlow({ registry, model, flow, instruction: 'Also tell me when the request fails' });
console.log(summarizeChanges(result.changes)); // "2 added, 1 changed"`;

	const adapter = `const ollama: ModelAdapter = {
	name: 'llama3',
	async complete({ system, messages }) {
		const response = await fetch('http://localhost:11434/api/chat', {
			method: 'POST',
			body: JSON.stringify({ model: 'llama3', system, messages, stream: false })
		});
		return { text: (await response.json()).message.content };
	}
};`;

	const mcp = `claude mcp add arcflow -- npx -y @arcsig-labs/mcp --url http://127.0.0.1:8787`;

	const serverAi = `ANTHROPIC_API_KEY=sk-... npx arcflow dev`;
</script>

<svelte:head><title>AI and agents — arcflow</title></svelte:head>

<h1>AI and agents</h1>
<p>
	A model never sees a blank page: it gets the catalog of steps you registered, and whatever it writes is validated against them. When something is wrong, the
	issues go back with their JSON paths until the flow holds — which is why generated flows are runnable rather than plausible.
</p>

<h2>Generate</h2>
<Code code={generate} />
<p>
	<code>flow</code> is ordinary flow JSON. <code>attempts</code> records each try with its raw text, issues and token usage, so you can see what the repair
	loop did.
</p>

<h2>Change an existing flow</h2>
<Code code={edit} />
<p><code>changes</code> lists what moved — enough to show a diff and let someone accept or reject it. Positions are ignored, so dragging a step is not a change.</p>

<h2>Explain</h2>
<p>
	<code>explainFlow</code> describes a flow in plain language, or answers a question about it — for a review comment, or for handing a flow to someone who did
	not build it.
</p>

<h2>Any model</h2>
<p><code>ModelAdapter</code> is text in, text out. <code>anthropicModel()</code> is included; anything else is a few lines.</p>
<Code code={adapter} />

<h2>In the editor</h2>
<p>
	With a key on the server, the canvas gets a prompt bar: describe a flow and it is built and validated in front of you, describe a change and it is applied,
	then <strong>Keep</strong> or <strong>Discard</strong> — on top of the normal undo history. With errors on the canvas the bar offers <strong>Fix problems</strong>,
	handing the model the issues and their paths; otherwise it offers <strong>Explain</strong>.
</p>
<Code code={serverAi} language="sh" />
<p>The key stays on the server: the browser calls <code>/api/ai/*</code> and never holds one.</p>

<h2>Agents (MCP)</h2>
<p>Point Claude Code, Cursor or any MCP client at your steps and let it build and run flows:</p>
<Code code={mcp} language="sh" />
<table>
	<thead><tr><th>Tool</th><th></th></tr></thead>
	<tbody>
		<tr><td><code>list_steps</code></td><td>Every step with its settings and outputs — the only source of truth</td></tr>
		<tr><td><code>validate_flow</code></td><td>Problems with their JSON paths, without saving</td></tr>
		<tr><td><code>test_flow</code></td><td>A simulated run: nothing is sent, every step reports what it would do</td></tr>
		<tr><td><code>patch_flow</code></td><td>Changes one part of a flow at the path an issue reported, instead of rewriting the document</td></tr>
		<tr><td><code>list_flows</code>, <code>get_flow</code>, <code>save_flow</code></td><td>What is on the server, and new versions of it</td></tr>
		<tr><td><code>run_flow</code>, <code>get_run</code></td><td>Run a saved flow and read what happened, step by step</td></tr>
	</tbody>
</table>
<p>Without a server the first three still work, so an agent can draft and check a flow before anything is saved.</p>
