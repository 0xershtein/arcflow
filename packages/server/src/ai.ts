import type { Flow, Issue, Registry } from '@arcflow/core';

/**
 * Flow generation, kept behind an interface so the server never needs an AI dependency
 * and browsers never need an API key: the editor asks the server, the server asks the model.
 * `createFlowAi` wires it to `@arcflow/ai` when that package is installed.
 */

export interface AiResult {
	ok: boolean;
	flow: Flow | null;
	issues: Issue[];
	/** What changed, when editing an existing flow. */
	changes?: unknown[];
	/** Which model answered. */
	model?: string;
	/** How many tries the repair loop needed. */
	attempts?: number;
}

export interface FlowAiService {
	generate(input: { prompt: string; vars?: Record<string, unknown> }): Promise<AiResult>;
	edit(input: { flow: Flow; instruction: string }): Promise<AiResult>;
	/** Describes a flow in plain language, or answers a question about it. */
	explain(input: { flow: Flow; question?: string }): Promise<{ text: string; model?: string }>;
}

export interface FlowAiOptions {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	registry: Registry<any>;
	/** A `ModelAdapter` from `@arcflow/ai`. Defaults to `anthropicModel()` (ANTHROPIC_API_KEY). */
	model?: unknown;
	/** House rules appended to the system prompt. */
	instructions?: string;
	/** Step kinds the model may not use. */
	exclude?: readonly string[];
	/** Extra tries after the first, each with the validation issues fed back. Default 2. */
	maxRepairs?: number;
}

type AiModule = typeof import('@arcflow/ai');

/**
 * Builds the service from `@arcflow/ai`, which stays an optional dependency: it is imported
 * the first time a flow is generated.
 */
export function createFlowAi(options: FlowAiOptions): FlowAiService {
	let module: Promise<AiModule> | undefined;
	const load = () =>
		(module ??= import('@arcflow/ai').catch(() => {
			throw new Error('Flow generation needs @arcflow/ai: npm install @arcflow/ai @anthropic-ai/sdk');
		}));

	const shared = async (ai: AiModule) => ({
		registry: options.registry,
		model: (options.model as AiModule['anthropicModel'] extends never ? never : ReturnType<AiModule['anthropicModel']>) ?? ai.anthropicModel(),
		...(options.instructions ? { instructions: options.instructions } : {}),
		...(options.exclude ? { exclude: options.exclude } : {}),
		...(options.maxRepairs === undefined ? {} : { maxRepairs: options.maxRepairs })
	});

	const summarize = (result: { ok: boolean; flow: Flow | null; issues: Issue[]; model: string; attempts: unknown[] }): AiResult => ({
		ok: result.ok,
		flow: result.flow,
		issues: result.issues,
		model: result.model,
		attempts: result.attempts.length
	});

	return {
		async generate({ prompt, vars }) {
			const ai = await load();
			const result = await ai.generateFlow({ ...(await shared(ai)), prompt, ...(vars ? { vars } : {}) });
			return summarize(result);
		},
		async edit({ flow, instruction }) {
			const ai = await load();
			const result = await ai.editFlow({ ...(await shared(ai)), flow, instruction });
			return { ...summarize(result), changes: result.changes };
		},

		async explain({ flow, question }) {
			const ai = await load();
			const base = await shared(ai);
			const result = await ai.explainFlow({
				registry: base.registry,
				model: base.model,
				...(options.instructions ? { instructions: options.instructions } : {}),
				flow,
				...(question ? { question } : {})
			});
			return { text: result.text, model: result.model };
		}
	};
}
