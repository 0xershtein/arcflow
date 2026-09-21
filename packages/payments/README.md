# @arcsig-labs/payments

An example domain pack for [arcflow](https://github.com/arcsig-labs/arcflow): treasury payouts that only move money after a multisig approval. It exists to show what a pack built on the standard steps looks like — four steps, one flow, and the `services` contract a host app fills in.

```ts
import { createEngine } from '@arcsig-labs/core';
import { createPayrollFlow, paymentsRegistry } from '@arcsig-labs/payments';

const flow = createPayrollFlow(); // plain flow JSON, built with the builder API
const run = await createEngine(paymentsRegistry, { services: { payments } }).start(flow, { mode: 'simulate' });
```

`paymentsRegistry` is `@arcsig-labs/nodes` plus this pack, so the payroll flow can use a cron trigger and an `if` step alongside the treasury steps.

## Steps

| Kind | Outputs | |
| --- | --- | --- |
| `treasury.runway` | out | Reads the vault balance and estimates months of runway; `{ token, balance, monthlyBurn, runwayMonths }` |
| `approval.multisig` | approved, rejected | Opens an approval request and **waits**; resume the run with `{ approved: boolean }` when signers decide |
| `action.transfer` | out | Sends stablecoins to one or more recipients. Refuses to run unless an `approval.multisig` step is upstream, and is never retried |
| `action.notify` | out | Posts a message to Telegram, Slack or email, with expressions |

Every step has a `simulate` branch, so Test run in the editor and `test_flow` over MCP work without any service configured: the sample vars give the vault a balance and a burn rate, and `action.transfer` debits the simulated balance.

## Services

The pack asks the host for a `payments` service when it runs live:

```ts
interface PaymentServices {
	getBalance(token: string): Promise<number>;
	getMonthlyBurn?(token: string): Promise<number>;
	requestApproval(request): Promise<{ requestId: string }>; // the run waits for engine.resume(...)
	transfer(request): Promise<{ txHash: string }>;
	notify(request: { channel: string; message: string }): Promise<void>;
}
```

`requestApproval` returns as soon as the request is opened. When enough signers have signed, call `engine.resume(flow, state, { nodeId, data: { approved: true } })` and the run continues down the `approved` port.

## The payroll flow

`createPayrollFlow()` pays the team on the first of the month, but only when runway is above six months and two of three founders approve. Runway too low, or a rejection, goes to a notification instead. It is the flow the docs site opens in its editor, and the shape most treasury automations take: a check, an approval, an action, a message.

This pack is an example. Copy it, rename the kinds and swap the services for your own.
