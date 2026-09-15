# Roadmap to 1.0

Goal: a workflow product developers can embed and agents can drive — build flows by hand or by prompt, run them for real, and inspect every execution. No public launch until M6.

Each milestone ends with tests, a working example, and updated docs.

## M1 — Runtime semantics (`@arcflow/core`)

The engine today runs branches once, on first arrival, and passes a single `output` along. Real flows need more.

- **Joins**: a step with several incoming branches can wait for all of them (`join: 'all'`) or run on the first (`'any'`). Inputs are available per source.
- **Loops**: run a branch once per item (`loop` step with `item` / `done` ports), with a concurrency limit.
- **Sub-flows**: call another flow as a step, with typed inputs and outputs.
- **Credentials**: `f.credential(type)` fields store a reference; the secret is resolved at run time through a credentials service and never appears in flow JSON or run state.
- **Execution records**: per-step input, output, logs, timing and size limits, suitable for history views.
- **Expression helpers**: `$now`, `$item`, `$index`, and safe filters such as `| sum`, `| length`, `| json` — still no `eval`.

Done when: joins, loops and sub-flows are covered by engine tests, including pause/resume inside a loop.

**Status: done.** Joins with dead-branch elimination, loops with concurrency slots and per-iteration resume (`each[2]/step`), sub-flows through a `flows` source with resume through the calling step (`call>step`) and a depth limit, credentials resolved into `ctx.secrets`, `$item` / `$index` / `$now` and whitelisted filters, JSON-serializable outputs with an optional `maxOutputBytes` limit.

## M2 — Standard steps (`@arcflow/nodes`)

A pack that makes the product useful without writing code:

Manual, Webhook, Schedule (cron), HTTP Request, Code (JavaScript in a QuickJS sandbox with time and memory limits), Set fields, If, Switch, Merge, Loop, Wait, Sub-flow, Respond to webhook.

Done when: an example flow fetches JSON from a public API, filters it in a Code step, branches, and posts the result — in tests and in the editor.

**Status: steps done.** `@arcflow/nodes` ships all thirteen steps. Code runs in a fresh QuickJS sandbox per step with time and memory limits; HTTP requests skip non-GET calls in test runs; short waits happen in place and long ones pause the run. The digest example (`createTodoDigestFlow`) runs end to end in tests with a mocked network. The payments pack now builds on these steps.

## M3 — Server runtime (`@arcflow/server`)

Runs flows for real, on Node, Bun, or edge runtimes.

- HTTP API (Hono): flows CRUD and versions, run now, resume, cancel, list and read runs.
- Webhook triggers at `/hooks/:path`, cron triggers via a scheduler.
- Storage adapters: memory, SQLite (`node:sqlite`), and an interface for Postgres and others.
- Encrypted credentials store.
- Live run events over Server-Sent Events.
- `npx arcflow dev`: server plus editor locally.

Done when: a flow saved in the editor fires from a real webhook and a cron schedule, survives a restart while waiting, and its run history is browsable.

**Status: runtime done; editor connection moves to M4.** `@arcflow/server` has the API, webhooks (immediate, when-finished and respond-step answers), a tick-based scheduler for cron and timers, memory and SQLite storage, encrypted credentials, SSE events, crash recovery that fails interrupted runs instead of replaying them, and `arcflow serve`. Saving from the editor and `npx arcflow dev` with the editor bundled come with the M4 server mode.

## M4 — Editor, n8n level (`@arcflow/editor`)

- Run inspector: each step's input and output as a collapsible JSON tree, for test runs and past executions.
- Data mapping: drag a field from a previous step's output onto an input to insert the expression.
- Expression editor with autocomplete from real upstream data and a live preview.
- Undo / redo, copy / paste, multi-select, keyboard shortcuts.
- Insert a step on an existing connection (`+`), sticky notes, sub-flow navigation.
- Server mode: load and save flows, credentials picker, execution history panel, live runs.

Done when: a new user can build the M2 example flow end to end without typing an expression by hand.

**Status: done except sub-flow navigation.** The inspector has Settings / Input / Output tabs with JSON trees per step and loop iteration, drag-to-map values, `{{` autocomplete from run data and live previews. Editing has undo/redo, copy/cut/paste as flow JSON (including fragments from an LLM), duplicate, select all, a selection bar, `+` on connections, drop-a-connection-to-add, and sticky notes stored as `annotations`. Server mode adds a `backend` option (`createHttpBackend` for `@arcflow/server`, or your own API): flow list, Save, Activate, credential picker, execution history, and a Run button that runs on the server and streams events onto the canvas. `registryFromManifest` rebuilds the step catalog in the browser from `GET /api/steps`, so `arcflow dev` serves the whole editor next to the API with no build step.

## M5 — AI (`@arcflow/ai`, `@arcflow/mcp`)

- `generateFlow(prompt)` and `editFlow(flow, instruction)` returning validated flows or JSON patch operations, with an automatic repair loop on issues.
- Model-agnostic adapter interface, with an adapter for common SDKs.
- Editor prompt bar: the flow assembles live on the canvas; changes appear as a diff to accept or reject; "explain this flow" and "fix these problems".
- MCP server exposing `list_steps`, `create_flow`, `edit_flow`, `validate_flow`, `run_flow`, `get_run`, so agents like Claude Code or Cursor can build and run flows directly.

Done when: from an empty canvas, a prompt produces a runnable version of the M2 example flow, and the same works through MCP.

## M6 — Launch

- Documentation site with live, embedded examples.
- Hosted demo.
- npm publish with provenance, changelog, semver.
- Short video and launch thread.

## Order

M1 → M2 → M3 → M4 → M5 → M6. M5's core (`generateFlow`, MCP) only needs M1 and can start in parallel once M1 lands.
