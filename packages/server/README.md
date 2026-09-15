# @arcflow/server

Runs arcflow flows for real: an HTTP API, webhook and cron triggers, timers that survive restarts, run history, encrypted credentials and live run events. Built on [Hono](https://hono.dev), so the app runs on Node, Bun, Deno or edge runtimes; storage is pluggable (memory and SQLite included).

## Command line

```sh
ARCFLOW_SECRET="a long random string" npx arcflow serve --db ./arcflow.db --steps ./my-steps.js
```

Loads the standard steps plus any modules passed with `--steps` (exporting a pack or step definitions), stores everything in one SQLite file, and listens on `http://127.0.0.1:8787`. `--api-key` protects `/api`; `--cors` allows a browser editor on another origin.

```sh
npx arcflow dev
```

Same server with the editor on the same address: open `http://127.0.0.1:8787` and build flows against your real steps, credentials and run history. The page takes its step catalog from `GET /api/steps`, so custom steps passed with `--steps` show up with no build step. It needs `@arcflow/editor` installed next to the server.

## In your app

```ts
import { createRegistry } from '@arcflow/core';
import { standardSteps } from '@arcflow/nodes';
import { createServer } from '@arcflow/server';
import { SqliteStorage, serveNode } from '@arcflow/server/node';

const server = await createServer({
	registry: createRegistry([standardSteps, myPack]),
	storage: new SqliteStorage('./arcflow.db'),
	secret: process.env.ARCFLOW_SECRET,
	services: { payments } // your own services for custom steps
});

await serveNode(server, { port: 8787 });
// or mount server.fetch in any Fetch-API runtime and call server.start() once
```

## HTTP API

| | |
| --- | --- |
| `GET /api/steps` | Step catalog: config schemas, outputs, the flow JSON Schema, a Markdown catalog for prompts, and a `manifest` that `registryFromManifest` turns back into a registry in the browser |
| `POST /api/flows/validate` | Parse and validate a flow without saving it |
| `GET /api/flows`, `POST /api/flows` | List flows; create one from `{ id?, flow, active? }` |
| `GET/PUT/DELETE /api/flows/:id` | Read (with issues), update (new version), delete |
| `POST /api/flows/:id/runs` | Start a run: `{ payload?, mode?: "live" \| "simulate", trigger?, wait? }` |
| `GET /api/runs?flowId&status&before&limit` | Run history, newest first |
| `GET /api/runs/:id` | Full run state and result |
| `POST /api/runs/:id/resume` | `{ nodeId, data? \| port?, output?, wait? }` — keys come from the run's waiting steps |
| `POST /api/runs/:id/cancel` | Cancel a running or waiting run |
| `GET /api/runs/:id/events` | Server-Sent Events for a live run |
| `GET/POST /api/credentials`, `PUT/DELETE /api/credentials/:id` | Credentials; values are write-only and stored with AES-256-GCM |
| `POST /api/ai/generate`, `POST /api/ai/edit` | Build a flow from a description, or change one — `{ prompt }` / `{ flow, instruction }`. 501 when generation is off |
| `ANY /hooks/<path>` | Webhook triggers of active flows |

Flows with errors can be saved as drafts but not activated. Only active flows answer webhooks and schedules.

## Flow generation

With `ANTHROPIC_API_KEY` set, `arcflow serve` and `arcflow dev` answer `/api/ai/*` and the editor gets a prompt bar. The key stays on the server — browsers never see it. `--no-ai` turns it off.

```ts
import { createFlowAi, createServer } from '@arcflow/server';

const server = await createServer({
	registry,
	ai: createFlowAi({ registry, instructions: 'Prefer our internal steps over raw HTTP.' })
});
```

`createFlowAi` uses [`@arcflow/ai`](../ai), which stays optional: install it (with `@anthropic-ai/sdk`) only if you want generation. Pass any `ModelAdapter` as `model` to use a different provider.

## Triggers and timers

- **Webhooks** match `trigger.webhook` steps by path and method. `respond` decides the answer: `immediately` (202 with the run id), `when-finished` (the run's result), or `respond-step` (whatever an `http.respond` step sends).
- **Schedules** run `trigger.schedule` steps on their cron expression. Each schedule is planned from the first tick that sees it; runs missed while the server was down are not replayed.
- **Timers**: runs paused by `logic.wait` are stored with a wake-up time and resumed by the scheduler, also after a restart.
- **Crashes**: runs that were mid-step when the process stopped are marked failed on the next start rather than re-executed, so non-idempotent steps never run twice by accident.

`server.scheduler.tick()` drives schedules and timers manually — pass `now` to `createServer` to test with a fake clock.
