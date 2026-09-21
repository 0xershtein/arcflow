import type { Flow, Registry } from '@arcsig-labs/core';
import type { ModelAdapter } from './model.js';
import { buildExplainPrompt, type PromptOptions } from './prompt.js';

export interface ExplainOptions extends PromptOptions {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	registry: Registry<any>;
	model: ModelAdapter;
	flow: Flow;
	/** Something specific to answer. Without it, the model describes the whole flow. */
	question?: string;
	maxTokens?: number;
	signal?: AbortSignal;
}

export interface ExplainResult {
	text: string;
	model: string;
	usage?: { inputTokens?: number; outputTokens?: number };
}

const DEFAULT_QUESTION = 'What does this flow do? Mention anything that looks wrong, risky or easy to miss.';

/**
 * Describes a flow in plain language — for a "what does this do?" panel, a pull request
 * comment, or handing a flow to someone who did not build it.
 */
export async function explainFlow(options: ExplainOptions): Promise<ExplainResult> {
	const { registry, model, flow, question, maxTokens, signal, ...prompt } = options;
	const reply = await model.complete({
		system: buildExplainPrompt(registry, prompt),
		messages: [
			{
				role: 'user',
				content: ['```json', JSON.stringify(flow, null, 2), '```', '', question?.trim() || DEFAULT_QUESTION].join('\n')
			}
		],
		...(maxTokens === undefined ? {} : { maxTokens }),
		...(signal ? { signal } : {})
	});
	return { text: reply.text.trim(), model: model.name, ...(reply.usage ? { usage: reply.usage } : {}) };
}
