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
| [`@arcflow/nodes`](./packages/nodes) | Standard steps: manual, webhook and cron triggers, HTTP request and response, sandboxed JavaScript, set fields, if, switch, merge, loop, wait, run flow. |
| [`@arcflow/server`](./packages/server) | Runs flows for real: HTTP API, webhook and cron triggers, restart-safe timers, run history, encrypted credentials, live events, `arcflow serve` CLI. |
| [`@arcflow/ai`](./packages/ai) | Builds and edits flows with an LLM: model-agnostic adapter, JSON output, and a repair loop that feeds validation issues back until the flow is valid. |
| [`@arcflow/mcp`](./packages/mcp) | MCP server so agents like Claude Code and Cursor can list steps, write, validate, test, save and run flows. |
| [`@arcflow/payments`](./packages/payments) | Example domain pack (runway check → multisig approval → transfer) built on the standard steps. |

## Run flows on a server

```sh
ARCFLOW_SECRET="a long random string" npx arcflow serve --db ./arcflow.db
```

```sh
# a flow whose trigger is { "kind": "trigger.webhook", "config": { "path": "orders/created" } }
curl -X POST localhost:8787/api/flows -d '{ "id": "orders", "active": true, "flow": { … } }'
curl -X POST localhost:8787/hooks/orders/created -d '{ "id": 42 }'   # runs every active flow whose webhook path is orders/created
curl localhost:8787/api/runs?flowId=orders                            # history
```

Webhooks, cron schedules and `logic.wait` timers are handled for you, runs survive restarts while they wait, and credentials are encrypted at rest. See [`@arcflow/server`](./packages/server) for the full API.

## Standard steps

```ts
import { createRegistry } from '@arcflow/core';
import { standardSteps } from '@arcflow/nodes';

const registry = createRegistry([standardSteps, myPack]);
```

| Kind | |
| --- | --- |
| `trigger.manual`, `trigger.webhook`, `trigger.schedule` | Start by hand, from an HTTP call, or on a cron schedule |
| `http.request`, `http.respond` | Call APIs (with credentials, timeouts, error output); answer the webhook caller |
| `code.javascript` | JavaScript in a QuickJS sandbox — no network or file access, time and memory limits |
| `data.set` | Build objects from values and expressions |
| `logic.if`, `logic.switch`, `logic.merge` | Branch on conditions or values; wait for branches and combine them |
| `logic.loop`, `logic.wait`, `flow.call` | Repeat per item, pause, run another flow |

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
| `ui` | `UiOptions` | `toolbar`, `palette`, `inspector`, `testRun`, `json`, `importExport`, `flows`, `executions`, `ai`, `controls`, `minimap`, `background`, `node`. |
| `labels` | `Partial<Labels>` | Replace or translate any interface text. |
| `readonly` | `boolean` | View only. |
| `storageKey` | `string` | Autosave to `localStorage`. |
| `services` | `Services` | Passed to steps during Test run (always `simulate` mode). |
| `runStepDelay` | `number` | Pause between steps during Test run, so a run is watchable. Default `450`ms. |
| `backend` | `Backend` | Connects to a flow server: open and save flows, activate them, pick credentials, run for real, browse past runs. See [Run flows on a server](#run-flows-on-a-server). |

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
	ui: { palette: false, minimap: true, background: 'lines', node: 'tile' },
	labels: { testRun: 'Çalıştır', searchSteps: 'Adım ara' }
});
```

All colors map to `--fb-*` CSS variables on `.fb-root`, so CSS overrides work as well. The defaults are a neutral gray palette with system fonts.

`colors` applies to both modes; `light` and `dark` override the same names for one mode only. The seventeen names:

| Token | Paints |
| --- | --- |
| `background` | The canvas, and the panels behind everything else. |
| `surface` | Cards, inputs, menus, the run log. |
| `surfaceHover` | Those same surfaces when hovered or active. |
| `surfaceActive` | Steps in the minimap. |
| `border` | Hairlines between rows and panels. |
| `borderStrong` | Outlines of cards, inputs and buttons. |
| `text` | Ordinary text. |
| `textSoft` | Secondary text: summaries, values, port labels. |
| `textMuted` | Labels, hints, timestamps, the category above a step's name. |
| `accent` | Selection, focus rings, step icons, running edges, run state. |
| `accentSoft` | The translucent ring and glow behind `accent`. |
| `primary` | The main button — Test run, Apply. |
| `primaryText` | Text on that button. |
| `danger` | Errors: text, borders, icons. |
| `dangerSoft` | The background behind an error. |
| `edge` | Connection lines. |
| `grid` | The canvas dot or line pattern. |

### Text

Every string the editor can show is in `labels` — 135 of them, from button captions to the
empty-canvas hint to validation wording. Pass the ones you want to change; the rest keep their
defaults. `{name}` and `{count}` placeholders are filled in at render time.

```ts
import { defaultLabels } from '@arcflow/editor';

Object.keys(defaultLabels); // every string, with its default
```

### Step shapes

`ui.node` picks how a step is drawn. The three shapes read the same flow and keep the
same handles, so switching is safe on a flow that already has positions.

| | |
| --- | --- |
| `card` | Default. A full card: category, name, what the step will do, and any port labels inside it. |
| `tile` | A square of icon with the name and summary underneath, and port labels beside the square. Closest to n8n. |
| `compact` | One row — icon and name only. Fits a lot of steps on screen. |

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
- **Loops** — a loop step runs its body once per item, each iteration isolated (`each[2]/send`), optionally several at a time, and can pause and resume inside an iteration.
- **Sub-flows** — a step can run another flow and continue with its result; waits inside it resume through the calling step (`call>approve`).
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

Point an agent at your steps and let it build flows:

```sh
claude mcp add arcflow -- npx -y @arcflow/mcp --url http://127.0.0.1:8787
```

It gets `list_steps`, `validate_flow`, `test_flow` (a simulated run, nothing sent), `patch_flow` (change one field at the path an issue reported, rather than rewriting the flow), `save_flow`, `run_flow` and `get_run` — see [`@arcflow/mcp`](./packages/mcp). In your own code, [`@arcflow/ai`](./packages/ai) does the same through `generateFlow` / `editFlow`, and with `ANTHROPIC_API_KEY` set the server offers `/api/ai/*` so the editor's prompt bar works without a key in the browser.

The pieces underneath are plain data:

```ts
const prompt = steps.describe();     // Markdown: flow format, expressions, every step with ports and config
const schema = steps.toJSONSchema(); // for structured output or tool parameters

const draft = await llm({ system: prompt, schema, input: 'When a user signs up, wait a day, then email them' });
const result = steps.parse(draft);
if (!result.ok) retryWith(result.issues); // codes and paths make repair loops reliable
editor.setFlow(result.flow);
```

The editor's **JSON** panel does the same by hand: paste a generated flow, apply, and copy the catalog or schema for your prompts. [AGENTS.md](./AGENTS.md) documents the repository and the issue codes for coding agents.

## In a framework

The default entry is a plain ES module with Svelte compiled into it, so React, Vue, Angular and
plain HTML all mount the editor the same way: `createEditor(element, options)`. Svelte is an
optional peer dependency — only the `/svelte` entry needs it installed.

Two rules make a wrapper behave:

- **Create it once** and push later changes through `setOptions` or `setFlow`. Recreating the
  editor throws away the canvas, the selection and the undo history.
- **Keep `flow` referentially stable.** A different object means a different flow, so a new one
  on every render reloads the canvas over whatever the person was editing. `steps` is fixed for
  the life of an instance.

**React**

```tsx
import { useEffect, useRef } from 'react';
import { createEditor, type EditorInstance, type EditorOptions } from '@arcflow/editor';

export function FlowEditor({ steps, className, ...options }: EditorOptions & { className?: string }) {
	const host = useRef<HTMLDivElement>(null);
	const editor = useRef<EditorInstance | null>(null);

	// Mounted once. Development mounts effects twice, so the cleanup has to destroy the
	// instance rather than leave a second canvas behind.
	useEffect(() => {
		const instance = createEditor(host.current!, { steps, ...options });
		editor.current = instance;
		return () => {
			instance.destroy();
			editor.current = null;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [steps]);

	// Theme, labels, readonly, callbacks and the flow can all change while it runs.
	useEffect(() => {
		editor.current?.setOptions(options);
	});

	return <div ref={host} className={className} style={{ height: '100dvh' }} />;
}

// A new flow object means a new flow, so hold it still:
//   const flow = useMemo(() => createPayrollFlow(), []);
```

**Vue**

```vue
<script setup lang="ts">
import { onBeforeUnmount, onMounted, useTemplateRef, watchEffect } from 'vue';
import { createEditor, type EditorInstance, type EditorOptions } from '@arcflow/editor';

const props = defineProps<{ steps: EditorOptions['steps']; flow?: EditorOptions['flow']; readonly?: boolean }>();
const emit = defineEmits<{ change: [unknown] }>();

const host = useTemplateRef<HTMLDivElement>('host');
let editor: EditorInstance | undefined;

onMounted(() => {
	editor = createEditor(host.value!, {
		steps: props.steps,
		flow: props.flow,
		readonly: props.readonly,
		onChange: (flow) => emit('change', flow)
	});
});

// Reactive props are pushed in; the steps are fixed for the life of the editor.
watchEffect(() => editor?.setOptions({ flow: props.flow, readonly: props.readonly }));

onBeforeUnmount(() => editor?.destroy());
</script>

<template>
	<div ref="host" style="height: 100dvh" />
</template>
```

**Svelte**

```svelte
<script lang="ts">
	import { FlowEditor } from '@arcflow/editor/svelte';
	import { standardRegistry } from '@arcflow/nodes';

	let { flow, save }: { flow?: unknown; save: (next: unknown) => void } = $props();
</script>

<div style="height: 100dvh">
	<FlowEditor steps={standardRegistry} {flow} theme="auto" onChange={save} />
</div>
```

**No framework**

The bare `@arcflow/editor` import below is resolved by a bundler (Vite, webpack, esbuild) or by an
[import map](https://developer.mozilla.org/docs/Web/HTML/Element/script/type/importmap) that points
`@arcflow/editor` and `@arcflow/nodes` at a CDN such as esm.sh. `arcflow dev` serves a ready-made page
with the editor and the standard steps if you just want to see it run.

```html
<div id="editor" style="height: 100dvh"></div>

<script type="module">
	import { createEditor } from '@arcflow/editor';
	import { standardSteps } from '@arcflow/nodes';

	const editor = createEditor('#editor', {
		steps: [standardSteps],
		theme: 'auto',
		onChange: (flow) => localStorage.setItem('flow', JSON.stringify(flow))
	});
</script>
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

Version 0.1.0 covers the engine, the standard steps, the server, the editor and the AI tooling; [`docs/roadmap.md`](./docs/roadmap.md) records what each milestone set out to do and what shipped. After 1.0:

- Custom node renderers per step kind
- A Postgres storage adapter for `@arcflow/server`
- Model adapters beyond Anthropic in `@arcflow/ai`

Releases follow [`docs/release.md`](./docs/release.md).

## License

[MIT](./LICENSE)
