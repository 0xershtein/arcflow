import {
	createEngine,
	waitingSteps,
	type AnyNodeDefinition,
	type EngineOptions,
	type Registry,
	type RunEvent,
	type RunMode,
	type RunState
} from '@arcflow/core';
import { conflict, notFound } from './errors.js';
import type { FlowRecord, RunRecord, RunTrigger, Storage } from './types.js';

export interface StartRunOptions {
	trigger: RunTrigger;
	payload?: unknown;
	mode?: RunMode;
	/** Start from this trigger only. */
	triggerNode?: string;
	/** Called synchronously as soon as the run has an id, before any step runs. */
	onCreated?: (runId: string) => void;
}

export interface ResumeRunOptions {
	nodeId: string;
	data?: unknown;
	port?: string;
	output?: unknown;
}

export interface RunHandle {
	/** The run as first saved. */
	run: RunRecord;
	/** Resolves when the run completes, fails, is cancelled, or waits. */
	finished: Promise<RunRecord>;
}

/** Earliest `until` of waiting timer steps. */
export function wakeAtOf(state: RunState): number | undefined {
	const times = waitingSteps(state)
		.filter((step) => step.reason === 'timer')
		.map((step) => Date.parse(String((step.data as { until?: unknown } | undefined)?.until)))
		.filter(Number.isFinite);
	return times.length ? Math.min(...times) : undefined;
}

/** Output of the top-level steps where a run ended (single output, or an object keyed by step id). */
export function runResult(state: RunState): unknown {
	const top = state.scopes['']?.edges ?? {};
	const delivered = new Set(
		Object.entries(top)
			.filter(([, status]) => status === 'delivered')
			.map(([edgeId]) => edgeId.slice(0, edgeId.indexOf(':')))
	);
	const outputs: Record<string, unknown> = {};
	for (const [key, step] of Object.entries(state.steps)) {
		if (!key.includes('/') && step.status === 'success' && !delivered.has(key)) outputs[key] = step.output;
	}
	const ids = Object.keys(outputs);
	return ids.length === 1 ? outputs[ids[0]] : ids.length ? outputs : undefined;
}

/** Starts, persists, resumes and cancels runs, and fans out their events. */
export class RunManager {
	readonly #engine: ReturnType<typeof createEngine<AnyNodeDefinition>>;
	readonly #storage: Storage;
	readonly #now: () => number;
	readonly #listeners = new Map<string, Set<(event: RunEvent) => void>>();
	readonly #controllers = new Map<string, AbortController>();
	readonly #busy = new Set<string>();
	readonly #writes = new Map<string, Promise<void>>();

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	constructor(registry: Registry<any>, storage: Storage, engineOptions: EngineOptions, now: () => number) {
		this.#engine = createEngine(registry, engineOptions);
		this.#storage = storage;
		this.#now = now;
	}

	/** Receives every event of a run until it ends. Returns an unsubscribe function. */
	subscribe(runId: string, listener: (event: RunEvent) => void) {
		let listeners = this.#listeners.get(runId);
		if (!listeners) this.#listeners.set(runId, (listeners = new Set()));
		listeners.add(listener);
		return () => {
			listeners.delete(listener);
			if (!listeners.size) this.#listeners.delete(runId);
		};
	}

	/** Whether the run is executing in this process right now. */
	isActive(runId: string) {
		return this.#controllers.has(runId) || this.#busy.has(runId);
	}

	start(flow: FlowRecord, options: StartRunOptions): Promise<RunHandle> {
		const base = { flowId: flow.id, flowVersion: flow.version, flow: flow.flow, trigger: options.trigger };
		return this.#execute(base, (controls) =>
			this.#engine.start(flow.flow, { ...controls, payload: options.payload, mode: options.mode, trigger: options.triggerNode })
		, options.onCreated);
	}

	async resume(runId: string, options: ResumeRunOptions): Promise<RunHandle> {
		if (this.#busy.has(runId) || this.#controllers.has(runId)) throw conflict(`Run "${runId}" is already running.`);
		this.#busy.add(runId);
		try {
			const stored = await this.#storage.getRun(runId);
			if (!stored) throw notFound(`Run "${runId}" does not exist.`);
			if (stored.status !== 'waiting') throw conflict(`Run "${runId}" is ${stored.status}, not waiting.`);
			const handle = await this.#execute(stored, (controls) => this.#engine.resume(stored.flow, stored.state, { ...controls, ...options }));
			handle.finished.finally(() => this.#busy.delete(runId)).catch(() => {});
			return handle;
		} catch (error) {
			this.#busy.delete(runId);
			throw error;
		}
	}

	async cancel(runId: string): Promise<void> {
		const controller = this.#controllers.get(runId);
		if (controller) {
			controller.abort();
			return;
		}
		const stored = await this.#storage.getRun(runId);
		if (!stored) throw notFound(`Run "${runId}" does not exist.`);
		if (stored.status !== 'waiting') throw conflict(`Run "${runId}" is ${stored.status} and cannot be cancelled.`);
		const at = this.#now();
		await this.#save(this.#record(stored, { ...stored.state, status: 'cancelled', updatedAt: at, finishedAt: at }));
		this.#emit({ type: 'run:end', runId, status: 'cancelled', at });
	}

	/** Marks runs left `running` by a previous process as failed. Steps are not re-executed. */
	async recover(): Promise<number> {
		const interrupted = await this.#storage.listRuns({ status: 'running', limit: 10_000 });
		const at = this.#now();
		let count = 0;
		for (const run of interrupted) {
			if (this.isActive(run.id)) continue;
			const state: RunState = {
				...run.state,
				status: 'failed',
				error: { message: 'The server stopped while this run was in progress.' },
				updatedAt: at,
				finishedAt: at
			};
			await this.#storage.saveRun(this.#record(run, state));
			count++;
		}
		return count;
	}

	#emit(event: RunEvent) {
		for (const listener of this.#listeners.get(event.runId) ?? []) {
			try {
				listener(event);
			} catch {
				// one broken subscriber must not affect others
			}
		}
	}

	#record(base: Pick<RunRecord, 'flowId' | 'flowVersion' | 'flow' | 'trigger'>, state: RunState): RunRecord {
		const record: RunRecord = {
			id: state.id,
			flowId: base.flowId,
			flowVersion: base.flowVersion,
			flow: base.flow,
			trigger: base.trigger,
			status: state.status,
			state: structuredClone(state),
			startedAt: state.startedAt,
			updatedAt: state.updatedAt
		};
		const wakeAt = wakeAtOf(state);
		if (wakeAt !== undefined) record.wakeAt = wakeAt;
		if (state.finishedAt !== undefined) record.finishedAt = state.finishedAt;
		return record;
	}

	/** Serializes writes per run so a slow save never overwrites a newer one. */
	#save(record: RunRecord) {
		const previous = this.#writes.get(record.id) ?? Promise.resolve();
		const next = previous.then(() => this.#storage.saveRun(record)).catch((error: unknown) => {
			console.error(`[arcflow] could not save run ${record.id}:`, error);
		});
		this.#writes.set(record.id, next);
		return next;
	}

	async #execute(
		base: Pick<RunRecord, 'flowId' | 'flowVersion' | 'flow' | 'trigger'>,
		kickoff: (controls: { signal: AbortSignal; onEvent: (event: RunEvent) => void; onCheckpoint: (state: RunState) => void }) => Promise<RunState>,
		onCreated?: (runId: string) => void
	): Promise<RunHandle> {
		const controller = new AbortController();
		let latest: RunRecord | undefined;
		let markCreated!: () => void;
		const created = new Promise<void>((resolve) => (markCreated = resolve));

		const finished = kickoff({
			signal: controller.signal,
			onEvent: (event) => this.#emit(event),
			onCheckpoint: (state) => {
				const first = !latest;
				latest = this.#record(base, state);
				if (first) {
					this.#controllers.set(state.id, controller);
					onCreated?.(state.id);
					markCreated();
				}
				void this.#save(latest);
			}
		}).then(async (state) => {
			const record = this.#record(base, state);
			this.#controllers.delete(state.id);
			await this.#save(record);
			this.#writes.delete(state.id);
			return record;
		});
		finished.catch(() => {});

		await Promise.race([created, finished]);
		if (!latest) return { run: await finished, finished };
		await this.#writes.get(latest.id);
		return { run: structuredClone(latest), finished };
	}
}
