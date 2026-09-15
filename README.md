# Flow builder

An n8n-style visual flow editor for SvelteKit. Drag steps onto a canvas, connect them, configure each one in a side panel, and watch a simulated test run walk through the graph.

It ships with an example **payments** pack — schedule a payout, let an agent check runway, branch on the result, require a multisig approval, then send stablecoins — but the core knows nothing about money. Bring your own node types.

Built with [Svelte 5](https://svelte.dev) and [Svelte Flow](https://svelteflow.dev).

## Features

- Drag-and-drop or click-to-add steps from a searchable palette
- Nodes with labeled output ports (`Yes` / `No`, `Approved` / `Rejected`, …)
- Inspector generated from each step's field definitions
- Live validation: missing triggers, required fields, loops, disconnected steps, and rules like "a transfer must come after an approval"
- Test run that animates through the graph using each step's simulated `run`
- Import / export as plain JSON, autosave to `localStorage`
- One CSS file of `--fb-*` tokens to re-skin everything

## Quick start

```sh
pnpm install
pnpm dev
```

Open http://localhost:5173.

## Using it

```svelte
<script lang="ts">
	import { FlowBuilder, createRegistry, paymentsPack, sampleFlow } from '$lib';

	const registry = createRegistry([paymentsPack]);
</script>

<div style="height: 100dvh">
	<FlowBuilder {registry} initial={sampleFlow} storageKey="my-flow" />
</div>
```

| Prop         | Type           | Description                                           |
| ------------ | -------------- | ----------------------------------------------------- |
| `registry`   | `Registry`     | Step definitions, built with `createRegistry(packs)`. |
| `initial`    | `FlowDocument` | Flow shown on first load and on Reset.                |
| `storageKey` | `string?`      | Autosave to `localStorage` under this key.            |
| `brand`      | `Snippet?`     | Content for the left side of the top bar.             |

The editor measures the DOM, so render it client-side (`export const ssr = false` in the page's `+page.ts`).

## Adding a step

A step is a plain object. Group steps into a pack:

```ts
import type { NodePack } from '$lib';

export const slackPack: NodePack = {
	id: 'slack',
	label: 'Slack',
	categories: [{ id: 'messaging', label: 'Messaging' }],
	nodes: [
		{
			kind: 'slack.post',
			title: 'Post to Slack',
			description: 'Send a message to a channel.',
			category: 'messaging',
			icon: 'bell',
			defaults: { channel: '#general', text: '' },
			fields: [
				{ key: 'channel', label: 'Channel', type: 'text', required: true },
				{ key: 'text', label: 'Message', type: 'textarea', required: true }
			],
			summary: (c) => `to ${c.channel}`,
			run: (c) => ({ next: 'out', message: `Posted to ${c.channel}` })
		}
	]
};
```

Then `createRegistry([paymentsPack, slackPack])`.

| Key                | What it does                                                                 |
| ------------------ | ---------------------------------------------------------------------------- |
| `trigger`          | No input port; a run starts here.                                            |
| `outputs`          | Output ports, e.g. `[{ id: 'true', label: 'Yes' }, …]`. Defaults to `out`.   |
| `fields`           | `text`, `textarea`, `number`, `select`, `toggle`; supports `required`, `showIf`. |
| `summary`          | One line shown on the canvas card.                                           |
| `check`            | Return an error message for invalid config.                                  |
| `requiresUpstream` | Require one of these kinds earlier in the graph.                             |
| `run`              | Simulated execution for Test run. Return the port(s) to continue through.    |

Icons are referenced by name from `src/lib/flow/icons.ts`; add your own there.

## Flow format

```json
{
	"version": 1,
	"name": "Monthly payroll",
	"nodes": [{ "id": "schedule", "kind": "trigger.schedule", "position": { "x": 0, "y": 0 }, "config": {} }],
	"edges": [{ "id": "e1", "source": "schedule", "sourceHandle": "out", "target": "runway", "targetHandle": "in" }]
}
```

`fromDocument` validates untrusted input before it reaches the editor.

## Project layout

```
src/lib/
  components/   FlowBuilder, Editor, FlowNode, Palette, Inspector, Icon
  flow/         types, registry, validate, runner, serialize, icons, theme.css
  packs/        payments example + sample flow
src/routes/     demo page
```

## Roadmap

- Undo / redo
- Custom node components per kind
- Server-side executor interface
- Publish as an npm package

## License

[MIT](./LICENSE)
