import { waitingSteps } from '@arcsig-labs/core';
import { nextRuns } from '@arcsig-labs/nodes';
import type { RunManager } from './runs.js';
import type { RunRecord, Storage } from './types.js';

export interface SchedulerOptions {
	storage: Storage;
	runs: RunManager;
	now: () => number;
	/** How often `tick()` runs once started. Default 1000 ms. */
	intervalMs?: number;
	onError?: (error: unknown) => void;
}

export interface TickResult {
	/** Runs started by schedule triggers. */
	started: string[];
	/** Runs whose timers were due and were resumed. */
	resumed: string[];
	/** Settles when every run started or resumed in this tick has finished or is waiting again. */
	finished: Promise<RunRecord[]>;
}

/**
 * Starts runs for active `trigger.schedule` steps and resumes `logic.wait` timers that are due.
 * Driven by `tick()`, so it can use any clock. A schedule is planned from the first tick that sees it;
 * runs missed while the server was down are not caught up.
 */
export class Scheduler {
	readonly #options: Required<Omit<SchedulerOptions, 'onError'>> & Pick<SchedulerOptions, 'onError'>;
	readonly #planned = new Map<string, number>();
	#timer?: ReturnType<typeof setInterval>;
	#ticking = false;

	constructor(options: SchedulerOptions) {
		this.#options = { intervalMs: 1_000, ...options };
	}

	start() {
		if (this.#timer) return;
		this.#timer = setInterval(() => {
			this.tick().catch((error) => this.#options.onError?.(error));
		}, this.#options.intervalMs);
	}

	stop() {
		clearInterval(this.#timer);
		this.#timer = undefined;
	}

	/** Next planned time for each schedule trigger, keyed by `flowId@version/nodeId`. */
	planned(): Record<string, number> {
		return Object.fromEntries(this.#planned);
	}

	async tick(): Promise<TickResult> {
		const started: string[] = [];
		const resumed: string[] = [];
		const pending: Promise<RunRecord>[] = [];
		const result = () => ({ started, resumed, finished: Promise.all(pending) });
		if (this.#ticking) return result();
		this.#ticking = true;

		const { storage, runs, onError } = this.#options;
		const now = this.#options.now();
		try {
			const seen = new Set<string>();
			for (const record of await storage.listFlows()) {
				if (!record.active) continue;
				for (const node of record.flow.nodes) {
					if (node.kind !== 'trigger.schedule' || node.disabled) continue;
					const key = `${record.id}@${record.version}/${node.id}`;
					seen.add(key);
					const cron = String(node.config.cron ?? '');
					const timezone = typeof node.config.timezone === 'string' ? node.config.timezone : undefined;
					const planned = this.#planned.get(key);
					if (planned === undefined) {
						this.#plan(key, cron, timezone, now);
						continue;
					}
					if (planned > now) continue;
					try {
						const handle = await runs.start(record, {
							trigger: { type: 'schedule', nodeId: node.id, at: planned },
							triggerNode: node.id,
							payload: { scheduledAt: new Date(planned).toISOString() }
						});
						started.push(handle.run.id);
						pending.push(handle.finished);
					} catch (error) {
						onError?.(error);
					}
					this.#plan(key, cron, timezone, now);
				}
			}
			for (const key of this.#planned.keys()) if (!seen.has(key)) this.#planned.delete(key);

			for (const run of await storage.dueRuns(now)) {
				const due = waitingSteps(run.state).find(
					(step) => step.reason === 'timer' && Date.parse(String((step.data as { until?: unknown } | undefined)?.until)) <= now
				);
				if (!due || runs.isActive(run.id)) continue;
				try {
					const handle = await runs.resume(run.id, { nodeId: due.key, data: { resumedAt: new Date(now).toISOString() } });
					resumed.push(run.id);
					pending.push(handle.finished);
				} catch (error) {
					onError?.(error);
				}
			}
		} finally {
			this.#ticking = false;
		}
		return result();
	}

	#plan(key: string, cron: string, timezone: string | undefined, now: number) {
		try {
			const [next] = nextRuns(cron, timezone, 1, new Date(now));
			if (next) this.#planned.set(key, next.getTime());
			else this.#planned.delete(key);
		} catch (error) {
			this.#planned.delete(key);
			this.#options.onError?.(error);
		}
	}
}
