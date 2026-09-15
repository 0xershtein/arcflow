import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import type { CredentialRecord, FlowRecord, ListRunsQuery, RunRecord, Storage } from '../types.js';

/**
 * SQLite storage using Node's built-in `node:sqlite` (Node 22.5+). Records are stored as JSON with indexed
 * columns for lookups, so a single file holds flows, run history and encrypted credentials.
 */
export class SqliteStorage implements Storage {
	readonly #db: DatabaseSync;

	constructor(path = ':memory:') {
		this.#db = new DatabaseSync(path);
		this.#db.exec(`
			PRAGMA journal_mode = WAL;
			CREATE TABLE IF NOT EXISTS flows (
				id TEXT PRIMARY KEY,
				updated_at INTEGER NOT NULL,
				data TEXT NOT NULL
			);
			CREATE TABLE IF NOT EXISTS runs (
				id TEXT PRIMARY KEY,
				flow_id TEXT NOT NULL,
				status TEXT NOT NULL,
				wake_at INTEGER,
				started_at INTEGER NOT NULL,
				data TEXT NOT NULL
			);
			CREATE INDEX IF NOT EXISTS runs_by_flow ON runs (flow_id, started_at);
			CREATE INDEX IF NOT EXISTS runs_by_wake ON runs (status, wake_at);
			CREATE TABLE IF NOT EXISTS credentials (
				id TEXT PRIMARY KEY,
				name TEXT NOT NULL,
				data TEXT NOT NULL
			);
		`);
	}

	#one<T>(sql: string, ...params: SQLInputValue[]): T | undefined {
		const row = this.#db.prepare(sql).get(...params) as { data: string } | undefined;
		return row ? (JSON.parse(row.data) as T) : undefined;
	}

	#many<T>(sql: string, ...params: SQLInputValue[]): T[] {
		return (this.#db.prepare(sql).all(...params) as { data: string }[]).map((row) => JSON.parse(row.data) as T);
	}

	async getFlow(id: string) {
		return this.#one<FlowRecord>('SELECT data FROM flows WHERE id = ?', id);
	}

	async listFlows() {
		return this.#many<FlowRecord>('SELECT data FROM flows ORDER BY updated_at DESC');
	}

	async saveFlow(record: FlowRecord) {
		this.#db
			.prepare('INSERT INTO flows (id, updated_at, data) VALUES (?, ?, ?) ON CONFLICT (id) DO UPDATE SET updated_at = excluded.updated_at, data = excluded.data')
			.run(record.id, record.updatedAt, JSON.stringify(record));
	}

	async deleteFlow(id: string) {
		this.#db.prepare('DELETE FROM flows WHERE id = ?').run(id);
	}

	async getRun(id: string) {
		return this.#one<RunRecord>('SELECT data FROM runs WHERE id = ?', id);
	}

	async listRuns(query: ListRunsQuery = {}) {
		const where: string[] = [];
		const params: SQLInputValue[] = [];
		if (query.flowId) {
			where.push('flow_id = ?');
			params.push(query.flowId);
		}
		if (query.status) {
			where.push('status = ?');
			params.push(query.status);
		}
		if (query.before !== undefined) {
			where.push('started_at < ?');
			params.push(query.before);
		}
		params.push(query.limit ?? 50);
		return this.#many<RunRecord>(`SELECT data FROM runs ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY started_at DESC LIMIT ?`, ...params);
	}

	async saveRun(record: RunRecord) {
		this.#db
			.prepare(
				`INSERT INTO runs (id, flow_id, status, wake_at, started_at, data) VALUES (?, ?, ?, ?, ?, ?)
				 ON CONFLICT (id) DO UPDATE SET status = excluded.status, wake_at = excluded.wake_at, data = excluded.data`
			)
			.run(record.id, record.flowId, record.status, record.wakeAt ?? null, record.startedAt, JSON.stringify(record));
	}

	async dueRuns(now: number) {
		return this.#many<RunRecord>("SELECT data FROM runs WHERE status = 'waiting' AND wake_at IS NOT NULL AND wake_at <= ? ORDER BY wake_at", now);
	}

	async getCredential(id: string) {
		return this.#one<CredentialRecord>('SELECT data FROM credentials WHERE id = ?', id);
	}

	async listCredentials() {
		return this.#many<CredentialRecord>('SELECT data FROM credentials ORDER BY name');
	}

	async saveCredential(record: CredentialRecord) {
		this.#db
			.prepare('INSERT INTO credentials (id, name, data) VALUES (?, ?, ?) ON CONFLICT (id) DO UPDATE SET name = excluded.name, data = excluded.data')
			.run(record.id, record.name, JSON.stringify(record));
	}

	async deleteCredential(id: string) {
		this.#db.prepare('DELETE FROM credentials WHERE id = ?').run(id);
	}

	close() {
		this.#db.close();
	}
}
