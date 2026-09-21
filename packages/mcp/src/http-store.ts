import type { Flow, RunState } from '@arcsig-labs/core';
import type { FlowStore } from './tools.js';

export interface HttpStoreOptions {
	/** `Authorization: Bearer <apiKey>` on every call. */
	apiKey?: string;
	fetch?: typeof globalThis.fetch;
}

/** Talks to a running `@arcsig-labs/server` over HTTP. */
export function createHttpStore(url: string, options: HttpStoreOptions = {}): FlowStore {
	const base = `${url.replace(/\/+$/, '')}/api`;
	const doFetch = options.fetch ?? globalThis.fetch.bind(globalThis);

	async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
		const response = await doFetch(base + path, {
			...init,
			headers: {
				...(options.apiKey ? { authorization: `Bearer ${options.apiKey}` } : {}),
				...(init.body ? { 'content-type': 'application/json' } : {}),
				...init.headers
			}
		});
		const text = await response.text();
		const data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
		if (!response.ok) {
			const detail = Array.isArray(data.issues) ? `\n${JSON.stringify(data.issues, null, 2)}` : '';
			throw new Error(`${typeof data.error === 'string' ? data.error : `${response.status} ${response.statusText}`}${detail}`);
		}
		return data as T;
	}

	type Record_ = { id: string; name: string; active: boolean; version: number; flow: Flow };

	return {
		async listFlows() {
			const { flows } = await request<{ flows: Record_[] }>('/flows');
			return flows.map(({ id, name, active, version }) => ({ id, name, active, version }));
		},
		async getFlow(id) {
			const { flow } = await request<{ flow: Record_ }>(`/flows/${encodeURIComponent(id)}`);
			return flow;
		},
		async saveFlow({ id, flow, active }) {
			const body = JSON.stringify({ flow, ...(active === undefined ? {} : { active }) });
			const saved = await request<{ flow: Record_ }>(id ? `/flows/${encodeURIComponent(id)}` : '/flows', {
				method: id ? 'PUT' : 'POST',
				body
			});
			const { id: savedId, name, version, active: isActive } = saved.flow;
			return { id: savedId, name, version, active: isActive };
		},
		async startRun(id, { payload, mode }) {
			const { run } = await request<{ run: { id: string; status: string } }>(`/flows/${encodeURIComponent(id)}/runs`, {
				method: 'POST',
				body: JSON.stringify({ mode, ...(payload === undefined ? {} : { payload }), wait: true })
			});
			return { id: run.id, status: run.status };
		},
		async getRun(id) {
			const { run } = await request<{ run: { id: string; status: string; state: RunState } }>(`/runs/${encodeURIComponent(id)}`);
			return { id: run.id, status: run.status, state: run.state };
		}
	};
}
