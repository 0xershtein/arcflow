# Changelog

All notable changes to arcflow are recorded here. The packages share one version and are released together; the project follows [semantic versioning](https://semver.org), and while the major version is 0 a minor bump may contain breaking changes.

## 0.1.0 — unreleased

The first release: build a flow in code, JSON, a canvas or a prompt, then run it headless or on a server.

### `@arcflow/core`

- Step definitions with `defineNode` and the `f.*` config schema (string, text, number, boolean, enum, list, json, credential), typed end to end: config, ports and `ctx` follow the definition.
- Flow format as plain JSON, with `normalizeFlow`, `registry.parse()` and `validateFlow` reporting issues with stable codes and JSON paths.
- Engine with branching, joins (`any` / `all`), loops with concurrency, sub-flows, retries, timeouts, `wait` / `resume`, credential resolution, dead-branch elimination and `onCheckpoint` for persistence.
- Expressions — `{{ path ?? fallback | filter: args }}` over vars, steps, input, trigger, run, `$item`, `$index` — evaluated without `eval`.
- `FlowBuilder` for typed flows in code, automatic layout, `toJSONSchema()` and `describe()` for LLM tooling, and `toManifest()` / `registryFromManifest()` to send a catalog to a browser.

### `@arcflow/nodes`

- Triggers: manual, webhook (three response modes), cron schedule.
- Steps: HTTP request and response, sandboxed JavaScript (QuickJS), set fields, if, switch, merge, loop, wait, run flow.

### `@arcflow/editor`

- Framework-free canvas: `createEditor(el, options)` with styles injected, plus a Svelte entry.
- Inspector with settings, input and output per step and loop iteration, drag-to-map values, `{{` autocomplete from real run data and live previews.
- Editing: undo/redo, copy/cut/paste as flow JSON, duplicate, multi-select, `+` on connections, drop-a-connection-to-add, sticky notes.
- Server mode: flow list, Save, Activate, credential picker, execution history, live runs over SSE.
- Prompt bar: build or change a flow with AI, then Keep or Discard; Fix problems and Explain.
- Three step shapes through `ui.node`: the default `card`, an n8n-style `tile` of icon with the name underneath, and a one-row `compact`.
- Theming through `--fb-*` variables — seventeen colour tokens, documented one by one — and every string replaceable through `labels`.
- The run log is docked under the canvas rather than floating over it, so a run never hides the steps it is running, and it follows the newest event unless the reader has scrolled up.

### `@arcflow/server`

- HTTP API for flows, runs and credentials; webhook and cron triggers; timers that survive restarts; run history; AES-256-GCM credentials; SSE events.
- `arcflow serve` and `arcflow dev`, which serves the editor on the same origin with no build step.
- `/api/ai/*` for flow generation when a model is configured, so browsers never hold an API key.

### `@arcflow/ai`

- `generateFlow` and `editFlow` with a repair loop: the model gets the step catalog, its JSON is validated, and the issues go back with their paths.
- `explainFlow` for a plain-language description, `diffFlows` for accept/reject, and a `ModelAdapter` interface with `anthropicModel()` for Claude.

### Documentation

- Reference for every option the packages take: the editor's fourteen, its seventeen colour tokens and 129 labels, and the engine, run, layout, sandbox, server, model and MCP options in each package's README.
- Docs site with a sidebar that lists each page's sections, mounting examples for HTML, React, Vue and Svelte behind one tab strip, and a live editor that switches step shape as you read about it.

### `@arcflow/mcp`

- MCP server over stdio with `list_steps`, `validate_flow`, `test_flow`, `list_flows`, `get_flow`, `save_flow`, `run_flow` and `get_run`, so agents can build and run flows.
