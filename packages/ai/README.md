# @arcflow/ai

Builds and edits [arcflow](https://github.com/0xershtein/arcflow) flows with an LLM. The model only ever sees the steps you registered, and whatever it returns is validated against them — issues go back to the model until the flow is valid.

```ts
import { createRegistry } from '@arcflow/core';
import { standardSteps } from '@arcflow/nodes';
import { anthropicModel, generateFlow } from '@arcflow/ai';

const registry = createRegistry([standardSteps]);

const { ok, flow, issues, attempts } = await generateFlow({
	registry,
	model: anthropicModel(), // ANTHROPIC_API_KEY
	prompt: 'Every Monday at 9, fetch open invoices and post a summary to our webhook'
});
```

`flow` is ordinary flow JSON: run it with `@arcflow/core`, save it through `@arcflow/server`, or open it in `@arcflow/editor`.

## Editing

```ts
import { editFlow, summarizeChanges } from '@arcflow/ai';

const result = await editFlow({ registry, model, flow, instruction: 'Also tell me when the request fails' });
console.log(summarizeChanges(result.changes)); // "2 added, 1 changed"
```

`changes` is a list of `step:added`, `step:changed`, `edge:removed`, … entries — enough to show a diff and let someone accept or reject it. Positions are ignored, so moving a step is not a change.

## Explaining

```ts
import { explainFlow } from '@arcflow/ai';

const { text } = await explainFlow({ registry, model, flow });
const answer = await explainFlow({ registry, model, flow, question: 'Can this pay someone twice?' });
```

Prose, not JSON — for a "what does this do?" panel, a pull request comment, or handing a flow to someone who did not build it.

## The repair loop

1. The system prompt is the flow format plus `registry.describe()` — every step, setting and output that exists.
2. The reply is parsed (code fences and stray prose are fine) and validated with `registry.parse()`.
3. If anything is wrong, the issues are sent back with their paths (`nodes[1].config.to: To is required`) and the model tries again — `maxRepairs` times (default 2).

`attempts` records each try with its raw text, flow, issues and token usage.

## Any model

`ModelAdapter` is text in, text out:

```ts
const ollama: ModelAdapter = {
	name: 'llama3',
	async complete({ system, messages }) {
		const response = await fetch('http://localhost:11434/api/chat', {
			method: 'POST',
			body: JSON.stringify({ model: 'llama3', system, messages, stream: false })
		});
		return { text: (await response.json()).message.content };
	}
};
```

`anthropicModel({ model, effort, apiKey, client })` is included and uses `claude-opus-5` by default. The Anthropic SDK stays an optional dependency — it is imported the first time the model is called, so install it only if you use it:

```sh
npm install @anthropic-ai/sdk
```

## Options

| | |
| --- | --- |
| `registry` | The steps the flow may use |
| `prompt` / `instruction` | What the flow should do, or what to change |
| `vars` | Run variables the flow can read as `{{ vars.name }}` |
| `instructions` | House rules appended to the system prompt |
| `exclude` | Step kinds the model may not use |
| `maxRepairs` | Extra tries after the first (default 2) |
| `onAttempt` | Called after every reply, to stream progress |
| `signal` | Cancels the run |
