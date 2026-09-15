# arcflow

**An embeddable, n8n-style flow editor and engine. Flow JSON in, flow JSON out.**

Drop a visual workflow builder into your own product — an automation panel, an internal tool, an agent console — and keep full control of the data. You define the step types; arcflow gives you the canvas, validation, test runs, a runtime that can pause for humans, and the JSON Schema an LLM needs to write flows for you.

- **No branding, fully themeable** — light / dark / auto, every color, font, radius and label is an option.
- **Framework-free** — `createEditor(element, options)` works in React, Vue, Angular or plain HTML. Svelte users get a component.
- **A plain data contract** — the flow is versioned JSON with a published schema; parsing never throws and returns coded issues.
- **Built for code and agents** — typed builder API, headless engine, `describe()` catalog and JSON Schema for LLMs.

| Package | |
| --- | --- |
| [`@arcflow/core`](./packages/core) | Headless engine, zero dependencies: step definitions, flow builder, parser/validator, runner with retries and pause/resume, JSON Schema + LLM catalog. |
| [`@arcflow/editor`](./packages/editor) | The canvas editor. One ES module with styles included. |
| [`@arcflow/payments`](./packages/payments) | Example step pack (schedule → check → approval → transfer) to copy from. |

## Quick start

```sh
npm install @arcflow/core @arcflow/editor
```

```ts
import { createRegistry, defineNode, f } from '@arcflow/core';
import { createEditor } from '@arcflow/editor';

// 1. Describe the steps your product supports.
const steps = createRegistry([
	defineNode({ kind: 'webhook', title: 'Webhook', description: 'Starts on an HTTP call.', trigger: true }),
	defineNode({
		kind: 'email',
		title: 'Send email',
		description: 'Sends an email.',
		config: { to: f.string(), subject: f.string({ default: 'Hello' }) },
		run: async (ctx) => ({ output: await mailer.send(ctx.config) })
	})
]);

// 2. Mount the editor. Give the element a height.
const editor = createEditor('#editor', {
	steps,
	flow: savedFlowJson,
	theme: { mode: 'auto', colors: { accent: '#0ea5e9' }, radius: 8 },
	onChange: (flow) => api.saveFlow(flow)
});
```

## Input and output

Everything that goes in or comes out is JSON-serializable, so it can be stored, diffed, reviewed and generated.

**In**

| Option | Type | |
| --- | --- | --- |
| `steps` | `Registry` or `(Pack \| NodeDefinition)[]` | Step types the user can place. |
| `flow` | `Flow` or JSON string | Flow to show. Changing it reloads the canvas. Positions are optional. |
| `theme` | `'light' \| 'dark' \| 'auto'` or `ThemeOptions` | `mode`, `colors`, `light`, `dark`, `fontFamily`, `monoFontFamily`, `fontSize`, `radius`, `nodeWidth`. |
| `ui` | `UiOptions` | `toolbar`, `palette`, `inspector`, `testRun`, `json`, `importExport`, `controls`, `minimap`, `background`. |
| `labels` | `Partial<Labels>` | Replace or translate any interface text. |
| `readonly` | `boolean` | View only. |
| `storageKey` | `string` | Autosave to `localStorage`. |
| `services` | `Services` | Passed to steps during Test run (always `simulate` mode). |

**Out**

| Callback | Receives |
| --- | --- |
| `onChange` | `Flow` after every edit (debounced) |
| `onValidate` | `Issue[]` whenever problems change, and once on load |
| `onSelect` | selected step id or `null` |
| `onRun` | `RunEvent` for each Test run event |

**Control**

```ts
editor.getFlow();                  // Flow
editor.getIssues();                // Issue[]
await editor.setFlow(json);        // { loaded, issues }
editor.setOptions({ theme: 'dark', readonly: true, labels: { testRun: 'Dry run' } });
await editor.run();                // simulated run on the canvas
editor.destroy();
```

### Flow JSON

```json
{
	"version": 1,
	"name": "Welcome email",
	"nodes": [
		{ "id": "hook", "kind": "webhook", "config": {} },
		{ "id": "mail", "kind": "email", "config": { "to": "{{ trigger.email }}" } }
	],
	"edges": [{ "from": "hook", "to": "mail" }]
}
```

Get the exact schema for your steps with `steps.toJSONSchema()`.

### Issues

`steps.parse(json)` never throws. Each issue has a stable `code` and a JSON `path`:

```json
{ "level": "error", "code": "required", "path": "nodes[1].config.to", "nodeId": "mail", "message": "Send email: To is required." }
```

## Theming

```ts
createEditor(el, {
	steps,
	theme: {
		mode: 'auto',
		colors: { accent: '#16a34a', accentSoft: 'rgba(22, 163, 74, 0.14)' },
		dark: { background: '#0b0f0c' },
		fontFamily: 'Inter, system-ui, sans-serif',
		radius: 4
	},
	ui: { palette: false, minimap: true, background: 'lines' },
	labels: { testRun: 'Çalıştır', searchSteps: 'Adım ara' }
});
```

All colors map to `--fb-*` CSS variables on `.fb-root`, so CSS overrides work as well. The defaults are a neutral gray palette with system fonts.

## Running flows (headless)

```ts
import { createEngine, waitingSteps } from '@arcflow/core';

const engine = createEngine(steps, { services });
let state = await engine.start(flow, { payload: request.body });

if (state.status === 'waiting') {
	await db.save(state); // plain JSON
	// later, e.g. after an approval
	state = await engine.resume(flow, state, { nodeId: waitingSteps(state)[0].nodeId, data: { approved: true } });
}
```

Built in:

- **Branching and joins** — untaken branches are skipped; a step can run on the first incoming branch or wait for all of them (`join: 'all'`).
- **Loops** — a loop step runs its body once per item, each iteration isolated (`each[2]/send`), and can pause and resume inside an iteration.
- **Credentials** — `f.credential('smtp')` stores only an id; secrets are resolved at run time and never written to flow JSON or run state.
- **Expressions** — `{{ steps.fetch.output.items | map: "price" | sum | round: 2 }}`, `{{ $item.email ?? "unknown" }}`; lookups and whitelisted filters only, no `eval`.
- Retries, timeouts, `error` output ports, cancellation, and `simulate` mode for side-effect-free test runs.

See [`@arcflow/core`](./packages/core).

## Building flows in code

```ts
const flow = steps.flow('Welcome');
flow.add('webhook').to(flow.add('email', { to: '{{ trigger.email }}' }));
const json = flow.build(); // validated and laid out
```

Kinds, config and port names are type-checked.

## For agents and LLMs

```ts
const prompt = steps.describe();     // Markdown: flow format, expressions, every step with ports and config
const schema = steps.toJSONSchema(); // for structured output or tool parameters

const draft = await llm({ system: prompt, schema, input: 'When a user signs up, wait a day, then email them' });
const result = steps.parse(draft);
if (!result.ok) retryWith(result.issues); // codes and paths make repair loops reliable
editor.setFlow(result.flow);
```

The editor's **JSON** panel does the same by hand: paste a generated flow, apply, and copy the catalog or schema for your prompts. [AGENTS.md](./AGENTS.md) documents the repository and the issue codes for coding agents.

## Svelte

```svelte
<script lang="ts">
	import { FlowEditor } from '@arcflow/editor/svelte';
</script>

<div style="height: 100dvh">
	<FlowEditor {steps} {flow} theme="dark" onChange={save} />
</div>
```

## Development

```sh
pnpm install
pnpm dev           # Svelte playground with a live settings bar
pnpm dev:vanilla   # the built bundle in a plain HTML page
pnpm test          # vitest, including type tests
pnpm check
pnpm build
```

## Roadmap

- Undo / redo, multi-select, copy and paste
- Joins that wait for parallel branches
- Custom node renderers per step kind
- MCP server exposing `describe`, `parse` and `run`

## License

[MIT](./LICENSE)
