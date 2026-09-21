# Changelog

All notable changes to arcflow are recorded here. The packages share one version and are released together; the project follows [semantic versioning](https://semver.org), and while the major version is 0 a minor bump may contain breaking changes.

## 0.1.0 — unreleased

The first release: build a flow in code, JSON, a canvas or a prompt, then run it headless or on a server.

### `@arcsig-labs/core`

- Step definitions with `defineNode` and the `f.*` config schema (string, text, number, boolean, enum, list, json, credential), typed end to end: config, ports and `ctx` follow the definition.
- Flow format as plain JSON, with `normalizeFlow`, `registry.parse()` and `validateFlow` reporting issues with stable codes and JSON paths.
- Engine with branching, joins (`any` / `all`), loops with concurrency, sub-flows, retries, timeouts, `wait` / `resume`, credential resolution, dead-branch elimination and `onCheckpoint` for persistence.
- `applyPatch(flow, ops)`: change part of a flow at the path validation reported, or by node id, with structural operations for wiring. All or nothing, so a half-applied edit never reaches the canvas.
- Expressions — `{{ path ?? fallback | filter: args }}` over vars, steps, input, trigger, run, `$item`, `$index` — evaluated without `eval`. A required field whose expression resolves to nothing at run time says so, and where the data stopped, instead of reading like a config mistake.
- A run started without a payload takes its trigger data from the trigger step's own output, so `{{ trigger.* }}` works in a run started by hand.
- `FlowBuilder` for typed flows in code, automatic layout, `toJSONSchema()` and `describe()` for LLM tooling, and `toManifest()` / `registryFromManifest()` to send a catalog to a browser — including which steps can pretend in a test run.

### `@arcsig-labs/nodes`

- Triggers: manual, webhook (three response modes), cron schedule. Each takes a `sample` payload that stands in when a run is started by hand.
- Steps: HTTP request and response, sandboxed JavaScript (QuickJS), set fields, if, switch, merge, loop, wait, run flow.

### `@arcsig-labs/editor`

- Framework-free canvas: `createEditor(el, options)` with styles injected, plus a Svelte entry.
- Inspector with settings, input and output per step and loop iteration, drag-to-map values, `{{` autocomplete from real run data and live previews.
- Editing: undo/redo, copy/cut/paste as flow JSON, duplicate, multi-select, `+` on connections, drop-a-connection-to-add, sticky notes.
- Sub-flow navigation: a step type that declares `subflow` gets a button opening the flow it calls, and a band above the canvas leads back out. Unsaved changes stop the move instead of being lost to it.
- Server mode: flow list, Save, Activate, credential picker, execution history, live runs over SSE. It opens the flow saved last, saves a flow with errors as a draft, and asks the server what it has configured so features it lacks are off rather than failing when pressed.
- Runs are labelled for what they were: a Test run in simulate mode (here, or on the server when the steps live there) or a real Run on the server, which wears the `live` colour.
- The layout follows the editor's own width: below about 820px one column, the step list in a drawer and the toolbar's extras in a More menu, usable down to about 400px.
- Fits into a host that has its own header: `ui.toolbar` takes the parts to keep and shrinks to a 40px strip when only the badge and the icons are left, `vars` supplies run variables without writing them into the flow, `summaries` replaces what a step says it will do per kind, the empty-canvas hints follow the interface they mention, and an empty label drops its hint. A development build warns once when the editor has no definite height to fill.
- Prompt bar: build or change a flow with AI, then Keep or Discard; Fix problems and Explain.
- Three step shapes through `ui.node`: the default `card`, an n8n-style `tile` of icon with the name underneath, and a one-row `compact`.
- Theming through `--fb-*` variables — nineteen colour tokens, documented one by one — and every string replaceable through `labels`.
- The run log is docked under the canvas rather than floating over it, so a run never hides the steps it is running, and it follows the newest event unless the reader has scrolled up.

### `@arcsig-labs/server`

- HTTP API for flows, runs and credentials; webhook and cron triggers; timers that survive restarts; run history; AES-256-GCM credentials; SSE events.
- `arcflow serve` and `arcflow dev`, which serves the editor on the same origin with no build step.
- `/api/ai/*` for flow generation when a model is configured, so browsers never hold an API key; each route says which feature is off when there is none.
- `/api/health` reports what the server has configured, and every answer under `/api` and `/hooks` is JSON, 404s included.

### `@arcsig-labs/ai`

- `generateFlow` and `editFlow` with a repair loop: the model gets the step catalog, its JSON is validated, and the issues go back with their paths.
- `explainFlow` for a plain-language description, `diffFlows` for accept/reject, and a `ModelAdapter` interface with `anthropicModel()` for Claude.

### Documentation

- Reference for every option the packages take: the editor's sixteen, its nineteen colour tokens and 151 labels, and the engine, run, layout, sandbox, server, model and MCP options in each package's README.
- Docs site with a sidebar that lists each page's sections, mounting examples for HTML, React, Vue and Svelte behind one tab strip, and a live editor that switches step shape as you read about it.

### `@arcsig-labs/mcp`

- MCP server over stdio with `list_steps`, `validate_flow`, `test_flow`, `patch_flow`, `list_flows`, `get_flow`, `save_flow`, `run_flow` and `get_run`, so agents can build, repair and run flows.
