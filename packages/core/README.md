# @arcflow/core

Typed, headless flow engine with no dependencies.

- **Steps** — `defineNode` with a config schema (`f.string`, `f.number`, `f.enum`, `f.list`, …) that yields TypeScript types, runtime validation, JSON Schema and form hints.
- **Flows** — plain JSON, built by hand, by `registry.flow()` with type-checked kinds and ports, or by an LLM.
- **Validation** — `registry.parse()` never throws and returns issues with stable `code`s and JSON `path`s.
- **Runs** — `createEngine().start()` with retries, timeouts, error ports, `{{ expressions }}`, cancellation, and `wait` / `resume()` for human approvals and delays. Run state is plain JSON.
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

See the [repository README](https://github.com/arcsig-labs/arcflow#readme) for the full guide.
