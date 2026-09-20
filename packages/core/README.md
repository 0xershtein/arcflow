# @arcflow/core

Typed, headless flow engine with no dependencies.

- **Steps** — `defineNode` with a config schema (`f.string`, `f.number`, `f.enum`, `f.list`, …) that yields TypeScript types, runtime validation, JSON Schema and form hints.
- **Flows** — plain JSON, built by hand, by `registry.flow()` with type-checked kinds and ports, or by an LLM.
- **Validation** — `registry.parse()` never throws and returns issues with stable `code`s and JSON `path`s.
- **Runs** — `createEngine().start()` with retries, timeouts, error ports, `{{ expressions }}`, cancellation, and `wait` / `resume()` for human approvals and delays. Run state is plain JSON.
- **Expressions that miss** — when a required field's `{{ }}` resolves to nothing at run time, the step's error says so and where the data stopped (`… the trigger payload had no body.total`) rather than reading like a config mistake. `describeMissing(expression, scope)` produces that sentence on its own.
- **Catalog over the wire** — `toManifest()` / `registryFromManifest()` carry everything but the code, including which steps have a `simulate` handler, so an editor can say what a test run really did.
- **AI** — `registry.toJSONSchema()` for structured output, `registry.describe()` for prompts.

```ts
import { createEngine, createRegistry, defineNode, f } from '@arcflow/core';

const start = defineNode({ kind: 'start', title: 'Start', description: 'Manual start.', trigger: true });
const greet = defineNode({
	kind: 'greet',
	title: 'Greet',
	description: 'Logs a greeting.',
	config: { name: f.string({ default: 'world' }) },
	run: (ctx) => ({ output: { text: `Hello, ${ctx.config.name}` } })
});

const registry = createRegistry([start, greet]);
const flow = registry.flow('Hello');
flow.add('start').to(flow.add('greet', { name: 'arcflow' }));

const run = await createEngine(registry).start(flow.build());
console.log(run.steps.greet.output); // { text: 'Hello, arcflow' }
```

## Patching a flow

`applyPatch(flow, ops)` changes part of a flow and returns a new one, leaving the original alone. It is
all or nothing: if any operation fails, the flow comes back untouched and every failure is listed with the
index of the operation that caused it.

```ts
import { applyPatch } from '@arcflow/core';

const issue = registry.validate(flow).find((entry) => entry.code === 'required');
// error required @ nodes[1].config.url
const { flow: fixed, applied } = applyPatch(flow, [{ op: 'set', path: issue.path, value: 'https://example.com' }]);
```

`set` and `remove` take the same paths validation reports; a node can also be addressed by id
(`nodes[fetch].config.url`), which survives reordering. `addNode` (with an optional `after` and `port` to
wire it), `removeNode` (which takes its connections with it), `connect` and `disconnect` handle structure.

## Options

`createEngine(registry, options)`:

| | |
| --- | --- |
| `services` | Your own services, handed to every step as `ctx.services`. |
| `flows` | Where sub-flows come from. Required by steps that return `{ call }`. |
| `mode` | `live` (default) or `simulate`. In `simulate` a step runs its `simulate` handler where it has one; a step without one runs normally, which is what makes conditions, data and code steps useful in a test run. |
| `maxOutputBytes` | Fail a step whose output is bigger than this, measured as JSON. Off by default. |
| `maxDepth` | How deep sub-flows may call sub-flows. Default 10. |
| `now` | Clock, for tests and for `$now` in expressions. |
| `createRunId` | Run id generator, when you want your own ids. |

`engine.start(flow, options)`:

| | |
| --- | --- |
| `trigger` | Trigger to start from. Defaults to every enabled trigger. |
| `payload` | Trigger payload, readable as `input` and `{{ trigger }}`. Without one, the trigger step's own output becomes `{{ trigger }}` — so a trigger with a `sample` gives a hand-started run something to read. |
| `vars` | Run variables, readable as `{{ vars.name }}`. They win over the flow's own `vars`, which win over the registry's `sampleVars` (simulate mode only); the flow itself is never written to. |
| `mode`, `signal`, `stepDelayMs`, `onEvent` | Per-run overrides of the mode, cancellation, a pause between steps, and the event stream. |

`layoutFlow(flow, registry, options)` positions nodes left to right:

| | |
| --- | --- |
| `columnGap` / `rowGap` | Distance between columns and rows. |
| `force` | Re-position every node, not only the ones without a position. |
| `portIndex` | Order of an output port on its node, so `true` lands above `false`. |

See the [repository README](https://github.com/arcsig-labs/arcflow#readme) for the full guide.
