# @arcsig-labs/nodes

Standard steps for arcflow: enough to build real automations without writing a step definition.

```ts
import { createEngine, createRegistry } from '@arcsig-labs/core';
import { standardSteps } from '@arcsig-labs/nodes';

const registry = createRegistry([standardSteps]);
const flow = registry.flow('Welcome');

const hook = flow.add('trigger.webhook', { path: 'signups' });
const lookup = flow.add('http.request', { url: 'https://api.example.com/users/{{ input.body.id }}', auth: 'crm-token' });
const pick = flow.add('code.javascript', { code: 'return { email: input.body.email, vip: input.body.plan === "pro" };' });
hook.to(lookup).to(pick);

const run = await createEngine(registry, { services: { credentials } }).start(flow.build(), { payload });
```

| Kind | Outputs | |
| --- | --- | --- |
| `trigger.manual` | out | Starts by hand; `sample` is used when a run has no payload |
| `trigger.webhook` | out | `{ method, path, headers, query, body }` from an HTTP call; `sample` stands in for the body in test runs |
| `trigger.schedule` | out | Cron expression and time zone; `nextRuns()` previews it; `sample` is merged in when a run has no payload |
| `http.request` | out, error | `{ status, ok, headers, body }`; credential types `bearer`, `basic`, `header`; test runs only send GET and HEAD |
| `http.respond` | out | Response for the webhook call, sent through `services.http.respond` |
| `code.javascript` | out, error | QuickJS sandbox with `input`, `inputs`, `vars`, `steps`, `$item`, `$index`; return a JSON value |
| `data.set` | out | Set fields by path, optionally on top of the input |
| `logic.if` | true, false | Conditions combined with all / any |
| `logic.switch` | case1–case4, otherwise | First case whose value equals the checked value |
| `logic.merge` | out | Waits for every branch; combines objects, lists inputs, or takes the first |
| `logic.loop` | item, done | Runs the item branch per element with a concurrency limit |
| `logic.wait` | out | Short waits in place, long waits pause the run with `{ reason: 'timer', data: { until } }` |
| `flow.call` | out, error | Runs another flow from the engine's `flows` source |

Every trigger takes a `sample`, so a flow started by hand — from the editor's Run or Test run, or `engine.start(flow)` with no payload — has data to work with. The trigger step's output becomes `{{ trigger }}` for the rest of the run; a real request or payload always wins over the sample.

`runSandboxed(code, { globals, timeoutMs, memoryLimitBytes, onLog })` and `evaluateCondition(left, operator, right)` are exported for use in your own steps.

## The Code sandbox

`code.javascript` runs in a fresh [QuickJS](https://bellard.org/quickjs/) instance per step, with
no network, no filesystem and no host globals. `runSandbox` takes the same limits if you use it
directly:

| | |
| --- | --- |
| `timeoutMs` | CPU time limit. Default 1000 ms. |
| `memoryLimitBytes` | Heap limit. Default 32 MB. |
| `globals` | Values exposed to the code as variables. Must be JSON-serializable. |
| `onLog` | Called with each `console.log` line, which is what the editor shows under Logs. |
