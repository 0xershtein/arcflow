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

Run `pnpm test` and `pnpm check` before committing. Commit messages are in English. The project is unbranded: no product names, logos or brand colors in packages.

## Layout

```
packages/core/src          dependency-free engine
  schema.ts                f.* field DSL → types, parseShape/parseField, defaults, visibility
  node.ts                  defineNode, definePack, NodeContext, StepResult, Services (augmentable)
  flow.ts                  Flow JSON types, normalizeFlow (structure only, never throws)
  validate.ts              kinds, config, ports, triggers, loops, reachability, requires, references
  registry.ts              createRegistry → get / parse / validate / flow / toJSONSchema / describe
  builder.ts               typed FlowBuilder
  layout.ts                auto-layout for flows without positions
  expressions.ts           {{ path ?? fallback }} (no eval)
  engine.ts                createEngine → start / resume, RunState, RunEvent
  json-schema.ts, describe.ts
packages/editor/src        the editor (Svelte 5 inside, framework-free outside)
  index.ts                 public entry: createEditor + option types (bundled by vite, core external)
  svelte.ts                entry for Svelte apps (components as source)
  vanilla.svelte.ts        createEditor: mount + getter props + style injection
  options.ts               EditorOptions, ThemeOptions, UiOptions, Labels, resolvers
  FlowEditor.svelte        props → context (labels, ui, readonly) + theme → Workspace
  Workspace.svelte         canvas, toolbar, run log, JSON panel, callbacks
  StepNode / StepPalette / StepInspector / FieldInput / JsonPanel
  theme.css, editor.css    all colors via --fb-* variables
packages/payments          example pack + payroll flow
apps/playground            SvelteKit demo with a settings bar
apps/vanilla               plain HTML using the built bundle
```

## Contract rules

- `Flow`, `Issue`, `RunState`, `RunEvent`, `EditorOptions` (minus callbacks and `steps`) must stay JSON-serializable.
- Issue `code` values and option names are public API: add, don't rename.
- Every interface string lives in `defaultLabels`; every color in `ThemeColors` and `--fb-*`. No hard-coded colors in components or CSS.
- New field options must work in types, `parseField`, `fieldSchema`, `describe` and `FieldInput`.
- Money-moving or otherwise non-idempotent steps must not set `retry`.

## Using the library from code

1. Catalog: `registry.describe()` (Markdown) or `registry.toJSONSchema()`.
2. Build a flow with `registry.flow(name)` (typed) or as JSON.
3. Pass untrusted JSON through `registry.parse(input)`. If `!result.ok`, fix each issue by `code` and `path`:

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

4. Run with `createEngine(registry, { services }).start(flow)`; use `mode: 'simulate'` for side-effect-free runs. Resume a `waiting` run with `engine.resume(flow, state, { nodeId, data })` or `{ nodeId, port }`.
5. In a browser, `createEditor(el, { steps, flow })` shows it; `editor.getFlow()` returns the edited JSON.
