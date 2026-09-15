# Notes for AI coding agents

This file is for assistants (Claude Code, Cursor, Copilot, …) working **in** this repository or **with** these packages.

## Commands

```sh
pnpm install
pnpm test      # vitest run — unit + type tests (expectTypeOf, @ts-expect-error)
pnpm check     # tsc / svelte-check in every package
pnpm build     # packages then playground
pnpm dev       # playground
```

Run `pnpm test` and `pnpm check` before committing. Commit messages are in English.

## Layout

```
packages/core/src
  schema.ts       f.* field DSL → types, parseShape/parseField, defaults, visibility
  node.ts         defineNode, definePack, NodeContext, StepResult, Services (augmentable)
  flow.ts         Flow JSON types, normalizeFlow (structure only, never throws)
  validate.ts     validateFlow (kinds, config, ports, triggers, loops, reachability, requires, references)
  registry.ts     createRegistry → get / parse / validate / flow / toJSONSchema / describe
  builder.ts      FlowBuilder: typed add / to / on(port) / build
  layout.ts       layered auto-layout for flows without positions
  expressions.ts  {{ path ?? fallback }} resolution (no eval)
  engine.ts       createEngine → start / resume; RunState, RunEvent
  json-schema.ts  flowSchema (JSON Schema 2020-12)
  describe.ts     Markdown catalog for prompts
packages/svelte/src   FlowEditor (public) → Workspace (canvas, run, JSON panel), StepNode, StepInspector, FieldInput, StepPalette
packages/payments/src pack.ts (steps + PaymentServices), payroll.ts (example flow built with the builder)
apps/playground       SvelteKit demo
```

## Using the library from code

1. Get the catalog: `registry.describe()` (Markdown) or `registry.toJSONSchema()`.
2. Produce a flow either with `registry.flow(name)` (typed) or as JSON.
3. Always pass untrusted JSON through `registry.parse(input)`. Check `result.ok`; otherwise fix each `issue` by `code` and `path`:

| code | fix |
| --- | --- |
| `no_trigger` | add a step whose kind is a trigger |
| `unknown_kind` | use a kind from the catalog |
| `required`, `invalid_type`, `invalid_enum`, `too_small`, `too_big`, `invalid_pattern` | correct `nodes[i].config.<field>` |
| `unknown_port` | use one of the source step's outputs on `edges[i].port` |
| `unknown_node` | point `edges[i].from/to` at an existing node id |
| `trigger_input` | remove edges that end at a trigger |
| `missing_upstream` | insert the required step kind before this one |
| `cycle` | remove the edge that loops back |
| `check_failed` | cross-field rule; read the message |
| `disconnected`, `unreachable`, `unknown_reference`, `unknown_key` | warnings; the flow still runs |

4. Run with `createEngine(registry, { services }).start(flow)`. Use `mode: 'simulate'` to test without side effects. A `waiting` run is resumed with `engine.resume(flow, state, { nodeId, data })` or `{ nodeId, port }`.

## Conventions

- Core stays dependency-free and runtime-agnostic (Node, browsers, workers).
- Parsing never throws; building (`build()`) and starting a run throw `FlowError` with `issues`.
- Issue `code` values are part of the public API — add new ones, don't rename.
- New step options must work in all four places: types, `parseField`, `fieldSchema`, `describe`.
- Money-moving steps must not set `retry`.
- In `.svelte` files use Svelte 5 runes; editor styles use `--fb-*` tokens from `theme.css`.
