<script lang="ts">
	import Code from '$lib/Code.svelte';
	// No cross-links on this page yet; import `base` here too when one is added.

	const flowJson = `{
	"version": 1,
	"name": "Monthly payroll",
	"nodes": [
		{ "id": "start", "kind": "trigger.schedule", "config": { "cron": "0 9 1 * *" } },
		{ "id": "pay", "kind": "http.request", "config": { "method": "POST", "url": "https://api.example.com/payouts" } }
	],
	"edges": [{ "from": "start", "to": "pay" }]
}`;

	const step = `import { defineNode, f } from '@arcsig-labs/core';

export const transfer = defineNode({
	kind: 'action.transfer',
	title: 'Send money',
	description: 'Pays a list of people from the treasury.',
	config: {
		token: f.enum(['USDC', 'EURC'], { default: 'USDC' }),
		recipients: f.list({ to: f.string(), amount: f.number({ min: 0 }) }, { minItems: 1 }),
		memo: f.text({ optional: true }),
		key: f.credential('treasury-key')
	},
	outputs: [{ id: 'out' }, { id: 'error', label: 'Error' }],
	summary: (c) => \`\${c.recipients.length} payouts in \${c.token}\`,
	async run(ctx) {
		const receipt = await pay(ctx.config, ctx.secrets.key);  // ctx.config is typed
		return { output: receipt, message: \`Sent \${receipt.total}\` };
	},
	simulate: (ctx) => ({ output: { total: ctx.config.recipients.length }, message: 'Would send' })
});`;

	const standard = `import { createRegistry } from '@arcsig-labs/core';
import { standardSteps } from '@arcsig-labs/nodes';

const registry = createRegistry([standardSteps, myPack]);`;

	const expressions = `{{ steps.check.output.balance }}        // another step's output
{{ input.email ?? "team@example.com" }} // fallback when missing
{{ steps.list.output.items | length }}  // filters after a pipe
{{ $item.name }} / {{ $index }}         // inside a loop
{{ vars.threshold }} · {{ trigger.body }} · {{ run.id }}`;

	const issues = `const result = steps.parse(untrustedJson);
if (!result.ok) {
	for (const issue of result.issues) {
		console.log(issue.level, issue.code, issue.path, issue.message);
		// error required nodes[1].config.url  URL is required.
	}
}`;
</script>

<svelte:head><title>Flows and steps — arcflow</title></svelte:head>

<h1>Flows and steps</h1>
<p>
	A flow is plain JSON: steps with settings, and connections between their output ports. Nothing in it is specific to the canvas — the same document runs
	headless, on a server, or inside another flow.
</p>
<Code code={flowJson} language="json" />

<h2>Steps</h2>
<p>
	A step declares what it needs with the <code>f.*</code> schema. That one declaration gives you the TypeScript type, runtime validation with paths, a form in
	the editor, and JSON Schema for models.
</p>
<Code code={step} />
<p>
	<code>simulate</code> is what test runs use, so a flow can be exercised end to end without side effects. <code>summary</code> is the line under the step's
	name on the canvas.
</p>

<h2 id="standard-steps">Standard steps</h2>
<p>
	<code>@arcsig-labs/nodes</code> has thirteen steps to start from; your own packs sit next to them in the same registry.
</p>
<Code code={standard} />
<table>
	<thead><tr><th>Kind</th><th></th></tr></thead>
	<tbody>
		<tr><td><code>trigger.manual</code>, <code>trigger.webhook</code>, <code>trigger.schedule</code></td><td>Start by hand, from an HTTP call, or on a cron schedule. Each takes a <code>sample</code> payload for runs started by hand.</td></tr>
		<tr><td><code>http.request</code>, <code>http.respond</code></td><td>Call APIs (with credentials, timeouts, an error output); answer the webhook caller. In test runs the request step sends only <code>GET</code> and <code>HEAD</code>.</td></tr>
		<tr><td><code>code.javascript</code></td><td>JavaScript in a QuickJS sandbox: no network or file access, 1 s of CPU and 32 MB of heap by default.</td></tr>
		<tr><td><code>data.set</code></td><td>Build an object from values and expressions.</td></tr>
		<tr><td><code>logic.if</code>, <code>logic.switch</code>, <code>logic.merge</code></td><td>Branch on conditions or values; wait for branches and combine them.</td></tr>
		<tr><td><code>logic.loop</code>, <code>logic.wait</code>, <code>flow.call</code></td><td>Repeat per item, pause, run another flow.</td></tr>
	</tbody>
</table>

<h2>Expressions</h2>
<p>Any setting can be an expression. They are parsed, not evaluated — there is no <code>eval</code> anywhere.</p>
<Code code={expressions} language="text" />

<h2>Validation</h2>
<p>
	Every problem has a stable code and a JSON path, which is what makes repair loops reliable — for a person fixing a field, or a model fixing its own output.
</p>
<Code code={issues} />

<h2>What the engine handles</h2>
<ul>
	<li><strong>Branching and joins</strong> — a step can wait for the first branch to arrive or for every branch to finish or be skipped.</li>
	<li><strong>Loops</strong> — steps after <code>item</code> run once per item, with a concurrency limit; <code>done</code> continues with the results.</li>
	<li><strong>Waiting</strong> — a step can pause the run for a timer or an approval; the state is JSON, so it survives a restart.</li>
	<li><strong>Retries and timeouts</strong> per step, and an <code>error</code> port for the ones that can fail.</li>
	<li><strong>Sub-flows</strong> — a step can run another flow and continue with its result.</li>
</ul>
