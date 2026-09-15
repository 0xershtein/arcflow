import type { CredentialRecord, FlowRecord, ListRunsQuery, RunRecord, Storage } from '../types.js';

const clone = <T>(value: T): T => structuredClone(value);

/** Keeps everything in memory. Good for tests and demos; data is lost on restart. */
export class MemoryStorage implements Storage {
	readonly #flows = new Map<string, FlowRecord>();
	readonly #runs = new Map<string, RunRecord>();
	readonly #credentials = new Map<string, CredentialRecord>();

	async getFlow(id: string) {
		const record = this.#flows.get(id);
		return record && clone(record);
	}

	async listFlows() {
		return [...this.#flows.values()].sort((a, b) => b.updatedAt - a.updatedAt).map(clone);
	}

	async saveFlow(record: FlowRecord) {
		this.#flows.set(record.id, clone(record));
	}

	async deleteFlow(id: string) {
		this.#flows.delete(id);
	}

	async getRun(id: string) {
		const record = this.#runs.get(id);
		return record && clone(record);
	}

	async listRuns(query: ListRunsQuery = {}) {
		return [...this.#runs.values()]
			.filter(
				(run) =>
					(!query.flowId || run.flowId === query.flowId) &&
					(!query.status || run.status === query.status) &&
					(query.before === undefined || run.startedAt < query.before)
			)
			.sort((a, b) => b.startedAt - a.startedAt)
			.slice(0, query.limit ?? 50)
			.map(clone);
	}

	async saveRun(record: RunRecord) {
		this.#runs.set(record.id, clone(record));
	}

	async dueRuns(now: number) {
		return [...this.#runs.values()].filter((run) => run.status === 'waiting' && run.wakeAt !== undefined && run.wakeAt <= now).map(clone);
	}

	async getCredential(id: string) {
		const record = this.#credentials.get(id);
		return record && clone(record);
	}

	async listCredentials() {
		return [...this.#credentials.values()].sort((a, b) => a.name.localeCompare(b.name)).map(clone);
	}

	async saveCredential(record: CredentialRecord) {
		this.#credentials.set(record.id, clone(record));
	}

	async deleteCredential(id: string) {
		this.#credentials.delete(id);
	}
}
