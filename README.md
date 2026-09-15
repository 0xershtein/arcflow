# arcflow

**A typed flow engine and n8n-style canvas you can drive from code, JSON, or an LLM.**

Define step types once. You get TypeScript types, validation with machine-readable issues, a JSON Schema and prompt catalog for AI, a runtime that can pause for humans and resume later, and a visual editor — all from the same definition.

| Package | What it is |
| --- | --- |
| [`@arcflow/core`](./packages/core) | Headless engine. Zero dependencies. Step definitions, flow builder, parser/validator, runner with retries and pause/resume, JSON Schema + LLM catalog. |
| [`@arcflow/svelte`](./packages/svelte) | Canvas editor on [Svelte Flow](https://svelteflow.dev): palette, generated config forms, live validation, animated test runs, JSON paste-in. |
| [`@arcflow/payments`](./packages/payments) | Example pack: schedules, runway checks, multisig approvals, stablecoin transfers. |
| [`apps/playground`](./apps/playground) | SvelteKit demo of the editor with the payments pack. |

## Why

Workflow tools are usually either a UI with an export button or a code SDK with no UI. arcflow treats the **flow JSON as the product**: humans edit it on a canvas, programs build it with a typed API, and LLMs write it against a schema — and the same engine runs it.

## Define steps

```ts
import { defineNode, definePack, f } from '@arcflow/core';

export const approval = defineNode({
	kind: 'approval.multisig',
	title: 'Approval',
	description: 'Waits until enough signers approve.',
	outputs: [{ id: 'approved' }, { id: 'rejected' }],
	config: {
		signers: f.list(f.string(), { minItems: 1 }),
		threshold: f.number({ integer: true, min: 1, default: 2 })
	},
	check: (c) => (c.threshold > c.signers.length ? 'threshold is higher than the number of signers' : null),
	async run(ctx) {
		// ctx.config is typed: { signers: string[]; threshold: number }
		if (ctx.resumed) return { port: ctx.resumed.data.approved ? 'approved' : 'rejected' };
		await ctx.services.approvals.request(ctx.config);
		return { wait: { reason: 'approval' } }; // the run pauses here
	},
	simulate: () => ({ port: 'approved' })
});

export const pack = definePack({ id: 'treasury', label: 'Treasury', nodes: [approval /* … */] });
```

## Build flows in code

```ts
import { createRegistry } from '@arcflow/core';

const registry = createRegistry([pack]);
const flow = registry.flow('Monthly payroll');

const start = flow.add('trigger.schedule', { every: 'month', day: 1 });
const healthy = flow.add('logic.condition', { value: '{{ steps.runway.output.runwayMonths }}', operator: '>', than: 6 });
const approve = flow.add('approval.multisig', { signers: ['a.eth', 'b.eth', 'c.eth'] });

start.to(healthy);
healthy.on('true').to(approve); // ports are type-checked: .on('maybe') does not compile
const json = flow.build();       // validated, auto-laid-out, plain JSON
```

## Run, pause, resume

```ts
import { createEngine, waitingSteps } from '@arcflow/core';

const engine = createEngine(registry, { services: { approvals, payments } });

let state = await engine.start(json, { onEvent: console.log });
if (state.status === 'waiting') {
	await db.save(state);                     // RunState is plain JSON
	// …later, when signers have approved:
	state = await engine.resume(json, await db.load(), { nodeId: 'approve', data: { approved: true } });
}
```

Steps can retry (`retry: { attempts, delayMs }`), time out (`timeoutMs`), route failures to an `error` output, and read earlier results with `{{ steps.<id>.output.<field> }}` expressions (lookups only, no `eval`). `mode: 'simulate'` runs `simulate()` handlers for side-effect-free test runs.

## Let an LLM write flows

```ts
const schema = registry.toJSONSchema(); // structured output / tool parameters
const catalog = registry.describe();    // Markdown: flow format, every step, ports, config

const draft = await llm.generate({ system: catalog, schema, prompt: 'Pay contractors every Friday after two approvals' });
const result = registry.parse(draft);    // never throws

if (!result.ok) {
	// every issue has a stable code and a JSON path, e.g.
	// { code: 'missing_upstream', path: 'nodes[3]', message: 'Pay: money can only move after an Approval step.' }
	// feed them back to the model and retry
}
```

## Embed the editor

```svelte
<script lang="ts">
	import { FlowEditor } from '@arcflow/svelte';
	let editor: FlowEditor;
</script>

<div style="height: 100dvh">
	<FlowEditor bind:this={editor} {registry} flow={json} onchange={(flow) => save(flow)} />
</div>
```

`editor.getFlow()`, `editor.load(json)` and `editor.run()` let your code (or an agent) drive it. The **JSON** panel accepts pasted flows and copies the step catalog and schema for prompts.

## Flow format

```json
{
	"version": 1,
	"name": "Monthly payroll",
	"nodes": [
		{ "id": "schedule", "kind": "trigger.schedule", "config": { "every": "month" } },
		{ "id": "approve", "kind": "approval.multisig", "config": { "signers": ["a.eth", "b.eth"] } }
	],
	"edges": [{ "from": "schedule", "to": "approve" }]
}
```

`position` is optional — flows without one are laid out automatically.

## Development

```sh
pnpm install
pnpm dev      # playground on http://localhost:5173
pnpm test     # vitest, including type tests
pnpm check    # type-check every package
pnpm build
```

See [AGENTS.md](./AGENTS.md) for architecture notes aimed at AI coding assistants.

## Roadmap

- Undo / redo and multi-select editing in the canvas
- Parallel branches that wait for each other (joins)
- MCP server exposing `describe`, `parse` and `run` as tools
- React bindings

## License

[MIT](./LICENSE)
