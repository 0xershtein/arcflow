/**
 * The only thing `@arcflow/ai` needs from a model: text in, text out.
 * Implement `ModelAdapter` for any provider, gateway or local model; `anthropicModel()`
 * is included for Claude.
 */

export interface ModelMessage {
	role: 'user' | 'assistant';
	content: string;
}

export interface ModelRequest {
	system: string;
	messages: ModelMessage[];
	maxTokens?: number;
	signal?: AbortSignal;
}

export interface ModelReply {
	text: string;
	usage?: { inputTokens?: number; outputTokens?: number };
}

export interface ModelAdapter {
	/** Shown in results and errors, e.g. "claude-opus-5". */
	readonly name: string;
	complete(request: ModelRequest): Promise<ModelReply>;
}

export interface AnthropicModelOptions {
	/** Defaults to `ANTHROPIC_API_KEY` from the environment. */
	apiKey?: string;
	/** Default `claude-opus-5`. */
	model?: string;
	/** Default 16000. */
	maxTokens?: number;
	/** How hard the model thinks: `low` … `max`. Left to the model's default when unset. */
	effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
	baseURL?: string;
	/** An Anthropic client you already have. Anything with `messages.create`. */
	client?: AnthropicLike;
}

/** The slice of the Anthropic SDK this adapter uses. */
export interface AnthropicLike {
	messages: {
		create(body: Record<string, unknown>, options?: { signal?: AbortSignal }): Promise<AnthropicMessage>;
	};
}

interface AnthropicMessage {
	content: { type: string; text?: string }[];
	stop_reason?: string | null;
	stop_details?: { category?: string | null; explanation?: string } | null;
	usage?: { input_tokens?: number; output_tokens?: number };
}

/**
 * Claude through the official SDK, which stays an optional dependency: it is imported
 * the first time the model is called.
 *
 *   const model = anthropicModel();                       // ANTHROPIC_API_KEY
 *   const model = anthropicModel({ effort: 'max' });      // think harder
 */
export function anthropicModel(options: AnthropicModelOptions = {}): ModelAdapter {
	const model = options.model ?? 'claude-opus-5';
	let client: Promise<AnthropicLike> | undefined;

	const load = () =>
		(client ??= (async () => {
			if (options.client) return options.client;
			let module: { default: new (init: Record<string, unknown>) => AnthropicLike };
			try {
				module = (await import('@anthropic-ai/sdk')) as unknown as typeof module;
			} catch {
				throw new Error('anthropicModel needs the Anthropic SDK: npm install @anthropic-ai/sdk');
			}
			return new module.default({
				...(options.apiKey ? { apiKey: options.apiKey } : {}),
				...(options.baseURL ? { baseURL: options.baseURL } : {})
			});
		})());

	return {
		name: model,
		async complete(request) {
			const anthropic = await load();
			const reply = await anthropic.messages.create(
				{
					model,
					max_tokens: request.maxTokens ?? options.maxTokens ?? 16000,
					system: request.system,
					messages: request.messages,
					...(options.effort ? { output_config: { effort: options.effort } } : {})
				},
				request.signal ? { signal: request.signal } : undefined
			);
			if (reply.stop_reason === 'refusal') {
				throw new Error(`The model declined this request${reply.stop_details?.explanation ? `: ${reply.stop_details.explanation}` : '.'}`);
			}
			return {
				text: reply.content
					.filter((block) => block.type === 'text')
					.map((block) => block.text ?? '')
					.join(''),
				usage: { inputTokens: reply.usage?.input_tokens, outputTokens: reply.usage?.output_tokens }
			};
		}
	};
}
