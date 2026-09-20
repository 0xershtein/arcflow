# Notes for AI coding agents

For assistants (Claude Code, Cursor, Copilot, …) working **in** this repository or **with** these packages.

## Commands

```sh
pnpm install
pnpm test          # vitest run — unit + type tests (expectTypeOf, @ts-expect-error)
pnpm check         # tsc / svelte-check in every package and app
pnpm build         # packages, then example apps
pnpm dev           # Svelte playground
pnpm dev:vanilla   # built editor bundle in plain HTML
```

Run `pnpm test` and `pnpm check` before committing. Commit messages are in English. The project is unbranded: no product names, logos or brand colors in packages. See [docs/roadmap.md](./docs/roadmap.md) for what is planned.

## Layout

```
packages/core/src          dependency-free engine
  schema.ts                f.* field DSL (string, text, number, boolean, enum, list, json, credential)
                           → types, parseShape/parseField, defaults, visibility
  node.ts                  defineNode, definePack, NodeContext, StepResult, Services (augmentable)
  flow.ts                  Flow JSON types, normalizeFlow (structure only, never throws)
  graph.ts                 connection index, loop bodies and which loop owns each step
  validate.ts              kinds, config, expressions, ports, triggers, loop bodies, cycles, reachability, requires, references
  registry.ts              createRegistry → get / parse / validate / flow / toJSONSchema / describe
  builder.ts               typed FlowBuilder
  layout.ts                auto-layout for flows without positions
  expressions.ts           {{ path ?? fallback | filter: args }} with FILTERS (no eval)
  engine.ts                createEngine → start / resume; scopes, joins, loops, credentials, RunState, RunEvent
  patch.ts                 applyPatch: set / remove by the path validation reports, addNode / removeNode / connect / disconnect
  json-schema.ts, describe.ts
packages/editor/src        the editor (Svelte 5 inside, framework-free outside)
  index.ts                 public entry: createEditor + option types (bundled by vite, core external)
  svelte.ts                entry for Svelte apps (components as source)
  vanilla.svelte.ts        createEditor: mount + getter props + style injection
  options.ts               EditorOptions, ThemeOptions, UiOptions, Labels, resolvers
  FlowEditor.svelte        props → context (labels, ui, readonly) + theme → Workspace
  Workspace.svelte         canvas, toolbar, history (JSON snapshots), clipboard, shortcuts, insert picker, test runs
  StepNode / StepPalette / StepInspector / FieldInput / ExpressionInput / JsonTree / JsonPanel
  convert.ts               flow JSON ⇄ Svelte Flow nodes/edges (steps "step", notes "note", edges "flow")
  NoteNode.svelte          sticky notes (flow.annotations, ignored by the engine)
  InsertEdge.svelte        connection with the "+" insert button
  StepPicker.svelte        searchable step popover used by "+" and drop-to-add
  backend.ts               Backend interface + createHttpBackend (fetch + SSE, no server dependency)
  ServerBar / ExecutionsPanel  server mode: flow list, Save, Activate, run history
  app.ts                   createArcflowApp: catalog from the server → registry → editor (dist/app.js)
  PromptBar.svelte         ask for a flow or a change, then keep or discard it
  theme.css, editor.css    all colors via --fb-* variables
packages/ai/src            generateFlow / editFlow: prompt from registry.describe(), JSON reply, repair loop
  model.ts                 ModelAdapter (text in, text out) + anthropicModel (SDK imported lazily)
  prompt.ts                system prompt, JSON extraction, issue feedback
  generate.ts              the loop, diffFlows and change summaries
  explain.ts               plain-language description of a flow (prose, not JSON)
packages/mcp/src           MCP server over stdio for agents (list_steps, validate_flow, test_flow, save_flow, run_flow, …)
  protocol.ts              JSON-RPC 2.0 framing, no SDK
  tools.ts                 the tools; remote ones need a FlowStore
  http-store.ts            FlowStore against a running @arcflow/server
packages/nodes/src         standard steps (kinds trigger.*, http.*, code.javascript, data.set, logic.*, flow.call)
  code.ts                  runSandboxed: QuickJS sandbox, loaded lazily with a dynamic import
  http.ts                  fetch-based request (credentials via ctx.secrets) and webhook response (services.http)
  logic.ts                 evaluateCondition, if / switch / merge / loop / wait
  schedule.ts              cron trigger and nextRuns (croner)
  examples.ts              standardRegistry, createTodoDigestFlow
packages/server/src        runtime service (Hono)
  server.ts                createServer: storage, secret box, services (credentials, http.respond), RunManager, Scheduler, app
  app.ts                   /api/* routes and /hooks/* webhooks; errors → JSON with issues
  runs.ts                  RunManager: start/resume/cancel, checkpoint persistence, events, recover(); runResult, wakeAtOf
  scheduler.ts             tick(): cron triggers (croner via @arcflow/nodes) and due logic.wait timers
  storage/                 Storage interface implementations: memory, sqlite (node:sqlite)
  secrets.ts               AES-256-GCM credential encryption (WebCrypto)
  cli.ts                   `arcflow serve`
packages/payments          domain pack (treasury.runway, approval.multisig, action.transfer, action.notify) + payroll flow
apps/playground            SvelteKit demo with a settings bar
apps/vanilla               plain HTML using the built bundle
docs/roadmap.md            milestones M1–M6
```

## Runtime model (engine.ts)

- Every connection ends up **delivered** or **dead** (branch not taken). A step runs when a connection delivers (`join: 'any'`, default) or when all incoming connections are settled and at least one delivered (`join: 'all'`). A step whose incoming connections are all dead is skipped, and its outgoing connections die too.
- **Loops**: a step with `loop: true` returns `{ loop: { items } }`. Steps reachable from its `item` output are the body; each item runs in its own scope with step keys like `each[2]/send`. `done` continues with the list of iteration results (the output of the body's last step, or an object when there are several).
- **Waiting**: `{ wait }` pauses a step. Resume with `engine.resume(flow, state, { nodeId: key, data | port })`, using the step key from `waitingSteps(state)` — including keys inside loops.
- **Loop concurrency**: `{ loop: { items, concurrency } }`. An iteration holds a slot from start until done, waiting included, so `concurrency: 1` is strictly sequential. Results stay in item order.
- **Sub-flows**: a step returning `{ call: { flow, input } }` runs a flow loaded from `createEngine(registry, { flows })`. Its state lives in `steps[key].child`; waiting steps inside are addressed as `call>approve` (nestable, limited by `maxDepth`). The step's output is the output of the sub-flow's final steps; a failed sub-flow fails the step (or routes to its `error` port).
- **Credentials**: `f.credential(type)` fields hold ids; `services.credentials.resolve()` provides `ctx.secrets[field]` at run time. Secrets never enter flow JSON, events or `RunState`.
- **Outputs** must be JSON-serializable; `maxOutputBytes` fails steps that return more.
- `RunState` is plain JSON (`scopes`, `steps`, `vars`) and can be stored between `start` and `resume`.

## Contract rules

- `Flow`, `Issue`, `RunState`, `RunEvent`, `EditorOptions` (minus callbacks and `steps`) must stay JSON-serializable.
- Issue `code` values, step keys, filter names and option names are public API: add, don't rename.
- Every interface string lives in `defaultLabels`; every color in `ThemeColors` and `--fb-*`. No hard-coded colors in components or CSS.
- New field kinds must work in types, `parseField`, `fieldSchema`, `describe` and `FieldInput`.
- Money-moving or otherwise non-idempotent steps must not set `retry`.
- `@arcflow/editor` keeps `"sideEffects": true`. The `/svelte` entry styles itself through bare CSS imports, and under Vite 8 / rolldown a side-effect-free package drops them before the CSS is ever resolved — a clean build with no styles and no warning. No CSS-targeting glob prevents that (it is the importer that is judged, not the stylesheet); only the whole package or the entry module itself can be marked. `@arcflow/editor/styles.css` exists for hosts that strip side-effect imports anyway.

## Using the library from code

1. Catalog: `registry.describe()` (Markdown) or `registry.toJSONSchema()`.
2. Build a flow with `registry.flow(name)` (typed) or as JSON.
3. Pass untrusted JSON through `registry.parse(input)`. If `!result.ok`, fix each issue by `code` and `path`:

| code | fix |
| --- | --- |
| `no_trigger` | add a step whose kind is a trigger |
| `unknown_kind` | use a kind from the catalog |
| `required`, `invalid_type`, `invalid_enum`, `too_small`, `too_big`, `invalid_pattern` | correct `nodes[i].config.<field>` |
| `invalid_expression` | fix the `{{ }}` expression: valid roots are vars, steps, input, inputs, trigger, run, $item, $index, $now; filters are listed by `describe()` |
| `unknown_port` | use one of the source step's outputs on `edges[i].port` |
| `unknown_node` | point `edges[i].from/to` at an existing node id |
| `trigger_input` | remove edges that end at a trigger |
| `missing_upstream` | insert the required step kind before this one |
| `loop_body_escape` | steps inside a loop may only connect to each other; continue after the loop from its `done` output |
| `cycle` | remove the edge that loops back; use a loop step to repeat work |
| `check_failed` | cross-field rule; read the message |
| `disconnected`, `unreachable`, `unknown_reference`, `unknown_key` | warnings; the flow still runs |

4. Fix one field rather than the document: `applyPatch(flow, [{ op: 'set', path: issue.path, value }])` takes the path the issue reported (`nodes[fetch].config.url` works too). `addNode` / `removeNode` / `connect` / `disconnect` handle wiring. All or nothing — a failed operation returns the flow untouched with the index that failed.
5. Run with `createEngine(registry, { services }).start(flow)`; use `mode: 'simulate'` for side-effect-free runs. Resume a `waiting` run with `engine.resume(flow, state, { nodeId: key, data })` or `{ nodeId: key, port }`.
6. In a browser, `createEditor(el, { steps, flow })` shows it; `editor.getFlow()` returns the edited JSON.
