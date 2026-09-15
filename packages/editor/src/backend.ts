import type { Flow, Issue, RunEvent, RunState } from '@arcflow/core';

/**
 * The editor's view of a flow server. `createHttpBackend` speaks to `@arcflow/server`;
 * implement this interface yourself to store flows in your own app.
 */

export type RunStatusName = RunState['status'];

export interface ServerFlowSummary {
	id: string;
	name: string;
	/** Only active flows answer webhooks and schedules. */
	active: boolean;
	/** Increases on every save. */
	version: number;
	createdAt: number;
	updatedAt: number;
	triggers?: { id: string; kind: string }[];
}

export interface ServerFlow extends ServerFlowSummary {
	flow: Flow;
}

export interface ServerRunSummary {
	id: string;
	flowId: string;
	flowVersion: number;
	status: RunStatusName;
	trigger: { type: string; [key: string]: unknown };
	startedAt: number;
	updatedAt: number;
	finishedAt?: number;
	/** When a waiting timer is due. */
	wakeAt?: number;
	error?: string;
}

export interface ServerRun extends ServerRunSummary {
	/** The flow as it was when the run started. */
	flow: Flow;
	state: RunState;
}

export interface ServerCredential {
	id: string;
	name: string;
	/** Matches `f.credential(type)`, e.g. "http-auth". */
	type: string;
	createdAt: number;
	updatedAt: number;
}

export interface RunQuery {
	flowId?: string;
	status?: RunStatusName;
	limit?: number;
	before?: number;
}

export interface StartRunOptions {
	payload?: unknown;
	mode?: 'live' | 'simulate';
	/** Id of the trigger step to start from. */
	trigger?: string;
}

/** What a flow the model wrote comes back as. */
export interface AiSuggestion {
	/** False when the model could not produce a valid flow; `issues` says why. */
	ok: boolean;
	flow: Flow | null;
	issues: Issue[];
	/** What changed, when editing an existing flow. */
	changes?: { type: string; id?: string; kind?: string; fields?: string[] }[];
	model?: string;
	/** How many tries the repair loop needed. */
	attempts?: number;
}

export interface Backend {
	/** Step catalog as JSON (`registryFromManifest` turns it into a registry). Optional. */
	manifest?(): Promise<unknown>;
	listFlows(): Promise<ServerFlowSummary[]>;
	getFlow(id: string): Promise<{ record: ServerFlow; issues: Issue[] }>;
	/** Creates the flow when `id` is missing, otherwise saves a new version. */
	saveFlow(input: { id?: string; flow: Flow; active?: boolean }): Promise<{ record: ServerFlow; issues: Issue[] }>;
	deleteFlow(id: string): Promise<void>;
	listRuns(query?: RunQuery): Promise<ServerRunSummary[]>;
	getRun(id: string): Promise<ServerRun>;
	startRun(flowId: string, options?: StartRunOptions): Promise<ServerRunSummary>;
	cancelRun(id: string): Promise<void>;
	resumeRun(id: string, input: { nodeId: string; data?: unknown; port?: string; output?: unknown }): Promise<ServerRunSummary>;
	/** Streams a run's events. Returns a function that stops listening. */
	watchRun(id: string, onEvent: (event: RunEvent) => void, onClose?: (error?: Error) => void): () => void;
	listCredentials(): Promise<ServerCredential[]>;
	createCredential(input: { name: string; type: string; value: unknown }): Promise<ServerCredential>;
	deleteCredential(id: string): Promise<void>;
	/** Builds a flow from a description. Optional; the prompt bar hides itself without it. */
	generateFlow?(input: { prompt: string; vars?: Record<string, unknown> }): Promise<AiSuggestion>;
	/** Changes a flow the way the instruction asks. */
	editFlow?(input: { flow: Flow; instruction: string }): Promise<AiSuggestion>;
	/** Describes a flow in plain language, or answers a question about it. */
	explainFlow?(input: { flow: Flow; question?: string }): Promise<{ text: string; model?: string }>;
}

export interface HttpBackendOptions {
	/** Sent as `Authorization: Bearer <apiKey>`. */
	apiKey?: string;
	/** Extra headers on every request. */
	headers?: Record<string, string>;
	/** Custom fetch (proxies, cookies, tests). */
	fetch?: typeof globalThis.fetch;
}

/** An error the server answered with. `issues` is set when a flow was refused. */
export class BackendError extends Error {
	constructor(
		message: string,
		readonly status: number,
		readonly issues: Issue[] = []
	) {
		super(message);
		this.name = 'BackendError';
	}
}

/** Talks to an `@arcflow/server` HTTP API. `url` is the server root, e.g. `http://localhost:8787`. */
export function createHttpBackend(url: string, options: HttpBackendOptions = {}): Backend {
	const base = url.replace(/\/+$/, '');
	const doFetch = options.fetch ?? globalThis.fetch.bind(globalThis);
	const headers = () => ({
		...options.headers,
		...(options.apiKey ? { authorization: `Bearer ${options.apiKey}` } : {})
	});

	async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
		const response = await doFetch(`${base}/api${path}`, {
			...init,
			headers: { ...headers(), ...(init.body ? { 'content-type': 'application/json' } : {}), ...init.headers }
		});
		if (response.status === 204) return undefined as T;
		const text = await response.text();
		const data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
		if (!response.ok) {
			throw new BackendError(
				typeof data.error === 'string' ? data.error : `${response.status} ${response.statusText}`,
				response.status,
				Array.isArray(data.issues) ? (data.issues as Issue[]) : []
			);
		}
		return data as T;
	}

	const query = (params: Record<string, string | number | undefined>) => {
		const search = new URLSearchParams();
		for (const [key, value] of Object.entries(params)) if (value !== undefined) search.set(key, String(value));
		const text = search.toString();
		return text ? `?${text}` : '';
	};

	return {
		manifest: () => request('/steps'),

		async listFlows() {
			return (await request<{ flows: ServerFlowSummary[] }>('/flows')).flows;
		},

		async getFlow(id) {
			const data = await request<{ flow: ServerFlow; issues: Issue[] }>(`/flows/${encodeURIComponent(id)}`);
			return { record: data.flow, issues: data.issues ?? [] };
		},

		async saveFlow({ id, flow, active }) {
			const body = JSON.stringify({ flow, ...(active === undefined ? {} : { active }) });
			const data = id
				? await request<{ flow: ServerFlow; issues: Issue[] }>(`/flows/${encodeURIComponent(id)}`, { method: 'PUT', body })
				: await request<{ flow: ServerFlow; issues: Issue[] }>('/flows', { method: 'POST', body });
			return { record: data.flow, issues: data.issues ?? [] };
		},

		deleteFlow: (id) => request(`/flows/${encodeURIComponent(id)}`, { method: 'DELETE' }),

		async listRuns(q = {}) {
			return (await request<{ runs: ServerRunSummary[] }>(`/runs${query({ ...q })}`)).runs;
		},

		async getRun(id) {
			return (await request<{ run: ServerRun }>(`/runs/${encodeURIComponent(id)}`)).run;
		},

		async startRun(flowId, start = {}) {
			const data = await request<{ run: ServerRunSummary }>(`/flows/${encodeURIComponent(flowId)}/runs`, {
				method: 'POST',
				body: JSON.stringify(start)
			});
			return data.run;
		},

		cancelRun: (id) => request(`/runs/${encodeURIComponent(id)}/cancel`, { method: 'POST', body: '{}' }),

		async resumeRun(id, input) {
			return (await request<{ run: ServerRunSummary }>(`/runs/${encodeURIComponent(id)}/resume`, { method: 'POST', body: JSON.stringify(input) })).run;
		},

		watchRun(id, onEvent, onClose) {
			// Read the SSE stream with fetch so the API key can travel in a header.
			const controller = new AbortController();
			void (async () => {
				try {
					const response = await doFetch(`${base}/api/runs/${encodeURIComponent(id)}/events`, {
						headers: { ...headers(), accept: 'text/event-stream' },
						signal: controller.signal
					});
					if (!response.ok || !response.body) throw new BackendError(`Cannot watch run ${id}.`, response.status);
					const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
					let buffer = '';
					for (;;) {
						const { done, value } = await reader.read();
						if (done) break;
						buffer += value;
						let split: number;
						while ((split = buffer.indexOf('\n\n')) >= 0) {
							const block = buffer.slice(0, split);
							buffer = buffer.slice(split + 2);
							const data = block
								.split('\n')
								.filter((line) => line.startsWith('data:'))
								.map((line) => line.slice(5).trim())
								.join('\n');
							if (!data) continue;
							try {
								onEvent(JSON.parse(data) as RunEvent);
							} catch {
								// ignore keep-alives and anything that is not an event
							}
						}
					}
					onClose?.();
				} catch (error) {
					if (controller.signal.aborted) onClose?.();
					else onClose?.(error instanceof Error ? error : new Error(String(error)));
				}
			})();
			return () => controller.abort();
		},

		generateFlow: (input) => request<AiSuggestion>('/ai/generate', { method: 'POST', body: JSON.stringify(input) }),

		editFlow: (input) => request<AiSuggestion>('/ai/edit', { method: 'POST', body: JSON.stringify(input) }),

		explainFlow: (input) => request<{ text: string; model?: string }>('/ai/explain', { method: 'POST', body: JSON.stringify(input) }),

		async listCredentials() {
			return (await request<{ credentials: ServerCredential[] }>('/credentials')).credentials;
		},

		async createCredential(input) {
			return (await request<{ credential: ServerCredential }>('/credentials', { method: 'POST', body: JSON.stringify(input) })).credential;
		},

		deleteCredential: (id) => request(`/credentials/${encodeURIComponent(id)}`, { method: 'DELETE' })
	};
}
