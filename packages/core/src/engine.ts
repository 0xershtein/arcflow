import { resolveTemplates } from './expressions.js';
import { FlowError, formatIssues } from './issues.js';
import { parseShape } from './schema.js';
import type { Flow, FlowNode } from './flow.js';
import type { AnyNodeDefinition, NodeContext, RunMode, Services, StepResult, StepView } from './node.js';
import type { Registry } from './registry.js';

export type StepStatus = 'pending' | 'running' | 'success' | 'waiting' | 'error' | 'skipped';
export type RunStatus = 'running' | 'waiting' | 'completed' | 'failed' | 'cancelled';

export interface StepLog {
	at: number;
	message: string;
	data?: unknown;
}

export interface StepRecord {
	status: StepStatus;
	attempts: number;
	input?: unknown;
	output?: unknown;
	ports?: string[];
	message?: string;
	error?: string;
	wait?: { reason: string; data?: unknown };
	/** Pending resume data, consumed when the step runs again. */
	resume?: { data: unknown };
	logs?: StepLog[];
	startedAt?: number;
	finishedAt?: number;
}

/**
 * Everything needed to continue a run later. Plain JSON as long as step outputs are,
 * so it can be stored in a database between `start()` and `resume()`.
 */
export interface RunState {
	id: string;
	flow: string;
	mode: RunMode;
	status: RunStatus;
	startedAt: number;
	updatedAt: number;
	finishedAt?: number;
	trigger?: unknown;
	vars: Record<string, unknown>;
	queue: string[];
	steps: Record<string, StepRecord>;
	error?: { message: string; nodeId?: string };
}

type Base = { runId: string; at: number };
export type RunEvent =
	| (Base & { type: 'run:start' })
	| (Base & { type: 'run:resume'; nodeId: string })
	| (Base & { type: 'step:start'; nodeId: string; attempt: number })
	| (Base & { type: 'step:log'; nodeId: string; message: string; data?: unknown })
	| (Base & { type: 'step:retry'; nodeId: string; attempt: number; error: string })
	| (Base & { type: 'step:success'; nodeId: string; ports: string[]; output?: unknown; message?: string })
	| (Base & { type: 'step:wait'; nodeId: string; reason: string; data?: unknown; message?: string })
	| (Base & { type: 'step:error'; nodeId: string; error: string; handled: boolean })
	| (Base & { type: 'step:skip'; nodeId: string })
	| (Base & { type: 'run:end'; status: RunStatus; error?: string });

export interface EngineOptions {
	services?: Services;
	/** Default mode for runs (default `live`). */
	mode?: RunMode;
	now?: () => number;
	createRunId?: () => string;
}

export interface RunControls {
	mode?: RunMode;
	signal?: AbortSignal;
	/** Called for every event. Listener errors are ignored. */
	onEvent?: (event: RunEvent) => void;
	/** Pause before each step — useful for animating a run in an editor. */
	stepDelayMs?: number;
	/** Safety limit on executed steps (default 10 000). */
	maxSteps?: number;
}

export interface StartOptions extends RunControls {
	/** Trigger to start from. Defaults to every enabled trigger. */
	trigger?: string;
	/** Trigger payload, available as `input` and `{{ trigger }}`. */
	payload?: unknown;
	vars?: Record<string, unknown>;
}

export interface ResumeOptions extends RunControls {
	nodeId: string;
	/**
	 * Finish the waiting step directly with this port (and optional output) …
	 */
	port?: string;
	output?: unknown;
	/** … or run the step again with `ctx.resumed = { data }` so it decides itself. */
	data?: unknown;
}

class CancelledError extends Error {
	constructor() {
		super('Run was cancelled.');
		this.name = 'AbortError';
	}
}

/** Errors that retrying cannot fix (bad config, unknown port). */
class StepError extends Error {}

const neverAborted = new AbortController().signal;

function sleep(ms: number, signal?: AbortSignal) {
	return new Promise<void>((resolve, reject) => {
		if (signal?.aborted) return reject(new CancelledError());
		const timer = setTimeout(resolve, ms);
		signal?.addEventListener(
			'abort',
			() => {
				clearTimeout(timer);
				reject(new CancelledError());
			},
			{ once: true }
		);
	});
}

function withTimeout<T>(promise: Promise<T>, ms: number | undefined, nodeId: string): Promise<T> {
	if (!ms) return promise;
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<never>((_, reject) => {
		timer = setTimeout(() => reject(new Error(`Step "${nodeId}" timed out after ${ms} ms.`)), ms);
	});
	return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** Steps currently waiting for `resume()`. */
export function waitingSteps(state: RunState) {
	return Object.entries(state.steps)
		.filter(([, step]) => step.status === 'waiting')
		.map(([nodeId, step]) => ({ nodeId, reason: step.wait?.reason ?? 'waiting', data: step.wait?.data }));
}

export type Engine = ReturnType<typeof createEngine>;

/**
 * Runs flows. Steps execute breadth-first from the trigger; a step reached from several branches
 * runs once, on first arrival. A step may pause the run (`{ wait }`), which is continued with `resume()`.
 */
export function createEngine<D extends AnyNodeDefinition>(registry: Registry<D>, options: EngineOptions = {}) {
	const now = options.now ?? Date.now;
	const createRunId =
		options.createRunId ??
		(() => globalThis.crypto?.randomUUID?.() ?? `run_${now().toString(36)}${Math.random().toString(36).slice(2, 10)}`);

	const emit = (controls: RunControls, event: RunEvent) => {
		try {
			controls.onEvent?.(event);
		} catch {
			// a failing listener must not break the run
		}
	};

	function prepare(input: Flow | unknown): Flow {
		const parsed = registry.parse(input);
		if (!parsed.ok) {
			const errors = parsed.issues.filter((issue) => issue.level === 'error');
			throw new FlowError(`Flow cannot run:\n${formatIssues(errors)}`, parsed.issues);
		}
		return parsed.flow;
	}

	const definition = (node: FlowNode) => registry.get(node.kind) as AnyNodeDefinition;

	function defaultPorts(def: AnyNodeDefinition, nodeId: string) {
		if (def.outputs.length <= 1) return def.outputs.map((port) => port.id);
		throw new StepError(
			`Step "${nodeId}" (${def.kind}) has several outputs and must return a port: ${def.outputs.map((p) => p.id).join(', ')}.`
		);
	}

	function checkPort(def: AnyNodeDefinition, nodeId: string, port: string) {
		if (!def.outputs.some((p) => p.id === port)) {
			throw new StepError(`Step "${nodeId}" returned unknown port "${port}" (outputs: ${def.outputs.map((p) => p.id).join(', ')}).`);
		}
		return port;
	}

	function stepsView(state: RunState): Record<string, StepView> {
		const view: Record<string, StepView> = {};
		for (const [id, step] of Object.entries(state.steps)) {
			if (step.status === 'success' || step.status === 'waiting' || step.status === 'error') {
				view[id] = { status: step.status, output: step.output };
			}
		}
		return view;
	}

	function enqueue(flow: Flow, state: RunState, from: string, ports: string[], input: unknown) {
		for (const edge of flow.edges) {
			if (edge.from !== from || !ports.includes(edge.port) || state.steps[edge.to]) continue;
			state.steps[edge.to] = { status: 'pending', attempts: 0, input };
			state.queue.push(edge.to);
		}
	}

	function complete(
		flow: Flow,
		state: RunState,
		node: FlowNode,
		record: StepRecord,
		result: { ports: string[]; output?: unknown; message?: string },
		controls: RunControls
	) {
		record.status = 'success';
		record.ports = result.ports;
		record.finishedAt = state.updatedAt = now();
		if (result.output !== undefined) record.output = result.output;
		if (result.message) record.message = result.message;
		delete record.wait;
		delete record.error;
		emit(controls, {
			type: 'step:success',
			runId: state.id,
			nodeId: node.id,
			ports: result.ports,
			output: result.output,
			message: result.message,
			at: record.finishedAt
		});
		// Steps without output pass their input along.
		enqueue(flow, state, node.id, result.ports, result.output !== undefined ? result.output : record.input);
	}

	function failStep(flow: Flow, state: RunState, node: FlowNode, record: StepRecord, message: string, controls: RunControls) {
		const def = definition(node);
		record.status = 'error';
		record.error = message;
		record.finishedAt = state.updatedAt = now();
		const handled = def.outputs.some((p) => p.id === 'error') && flow.edges.some((e) => e.from === node.id && e.port === 'error');
		emit(controls, { type: 'step:error', runId: state.id, nodeId: node.id, error: message, handled, at: record.finishedAt });
		if (handled) {
			record.ports = ['error'];
			enqueue(flow, state, node.id, ['error'], { error: message, input: record.input });
			return;
		}
		state.status = 'failed';
		state.error = { message, nodeId: node.id };
	}

	function applyResult(flow: Flow, state: RunState, node: FlowNode, record: StepRecord, result: StepResult, controls: RunControls) {
		const def = definition(node);
		if (result && 'wait' in result && result.wait) {
			record.status = 'waiting';
			record.wait = { reason: result.wait.reason, ...(result.wait.data === undefined ? {} : { data: result.wait.data }) };
			if (result.message) record.message = result.message;
			state.updatedAt = now();
			emit(controls, {
				type: 'step:wait',
				runId: state.id,
				nodeId: node.id,
				reason: result.wait.reason,
				data: result.wait.data,
				message: result.message,
				at: state.updatedAt
			});
			return;
		}
		const value = (result ?? {}) as { port?: string | readonly string[]; output?: unknown; message?: string };
		const ports =
			value.port === undefined
				? defaultPorts(def, node.id)
				: (typeof value.port === 'string' ? [value.port] : [...value.port]).map((port) => checkPort(def, node.id, port));
		complete(flow, state, node, record, { ports, output: value.output, message: value.message }, controls);
	}

	async function execute(flow: Flow, state: RunState, node: FlowNode, record: StepRecord, controls: RunControls) {
		const def = definition(node);
		record.status = 'running';
		record.startedAt = state.updatedAt = now();
		const resumed = record.resume;
		delete record.resume;

		if (controls.stepDelayMs) await sleep(controls.stepDelayMs, controls.signal);

		if (node.disabled) {
			const ports = def.outputs.length ? [def.outputs[0].id] : [];
			complete(flow, state, node, record, { ports, message: 'Disabled — passed through' }, controls);
			return;
		}

		const handler = state.mode === 'simulate' ? (def.simulate ?? def.run) : def.run;
		const attempts = Math.max(1, def.retry?.attempts ?? 1);
		let lastError = 'Unknown error';

		for (let attempt = 1; attempt <= attempts; attempt++) {
			record.attempts = attempt;
			emit(controls, { type: 'step:start', runId: state.id, nodeId: node.id, attempt, at: now() });
			try {
				const steps = stepsView(state);
				const scope = { vars: state.vars, steps, input: record.input, trigger: state.trigger, run: { id: state.id, mode: state.mode } };
				const parsed = parseShape(def.config, resolveTemplates(node.config, scope));
				const errors = parsed.issues.filter((issue) => issue.level === 'error');
				if (errors.length) throw new StepError(errors.map((issue) => `${issue.path}: ${issue.message}`).join(' '));

				const ctx: NodeContext = {
					config: parsed.value,
					input: record.input,
					vars: state.vars,
					steps,
					services: options.services ?? ({} as Services),
					mode: state.mode,
					runId: state.id,
					nodeId: node.id,
					attempt,
					signal: controls.signal ?? neverAborted,
					resumed,
					log: (message, data) => {
						const entry: StepLog = { at: now(), message, ...(data === undefined ? {} : { data }) };
						(record.logs ??= []).push(entry);
						emit(controls, { type: 'step:log', runId: state.id, nodeId: node.id, message, data, at: entry.at });
					}
				};
				const result = handler
					? await withTimeout(Promise.resolve().then(() => handler.call(def, ctx)), def.timeoutMs, node.id)
					: undefined;
				applyResult(flow, state, node, record, result, controls);
				return;
			} catch (error) {
				if (error instanceof CancelledError || controls.signal?.aborted) throw new CancelledError();
				lastError = error instanceof Error ? error.message : String(error);
				if (error instanceof StepError || attempt === attempts) break;
				emit(controls, { type: 'step:retry', runId: state.id, nodeId: node.id, attempt, error: lastError, at: now() });
				const delay = (def.retry?.delayMs ?? 0) * (def.retry?.factor ?? 2) ** (attempt - 1);
				if (delay) await sleep(delay, controls.signal);
			}
		}
		failStep(flow, state, node, record, lastError, controls);
	}

	function finish(flow: Flow, state: RunState, controls: RunControls): RunState {
		const at = now();
		if (state.status === 'running') {
			state.status = Object.values(state.steps).some((step) => step.status === 'waiting') ? 'waiting' : 'completed';
		}
		if (state.status !== 'waiting') {
			state.queue = [];
			for (const node of flow.nodes) {
				const record = state.steps[node.id];
				if (record?.status === 'running') {
					record.status = 'error';
					record.error = 'Cancelled';
					record.finishedAt = at;
				} else if (!record || record.status === 'pending') {
					state.steps[node.id] = { status: 'skipped', attempts: record?.attempts ?? 0 };
					emit(controls, { type: 'step:skip', runId: state.id, nodeId: node.id, at });
				}
			}
			state.finishedAt = at;
		}
		state.updatedAt = at;
		emit(controls, { type: 'run:end', runId: state.id, status: state.status, error: state.error?.message, at });
		return state;
	}

	async function drive(flow: Flow, state: RunState, controls: RunControls): Promise<RunState> {
		const byId = new Map(flow.nodes.map((node) => [node.id, node]));
		const maxSteps = controls.maxSteps ?? 10_000;
		let executed = 0;
		try {
			while (state.queue.length) {
				if (controls.signal?.aborted) throw new CancelledError();
				const nodeId = state.queue.shift()!;
				const record = state.steps[nodeId];
				const node = byId.get(nodeId);
				if (!record || record.status !== 'pending' || !node) continue;
				if (++executed > maxSteps) {
					state.status = 'failed';
					state.error = { message: `Run stopped after ${maxSteps} steps.`, nodeId };
					break;
				}
				await execute(flow, state, node, record, controls);
				if (state.status === 'failed') break;
			}
		} catch (error) {
			if (!(error instanceof CancelledError)) throw error;
			state.status = 'cancelled';
		}
		return finish(flow, state, controls);
	}

	/** Starts a run and resolves when it completes, fails, is cancelled, or waits. */
	async function start(input: Flow | unknown, controls: StartOptions = {}): Promise<RunState> {
		const flow = prepare(input);
		const triggers = flow.nodes.filter((node) => !node.disabled && registry.get(node.kind)?.trigger);
		const startIds = controls.trigger ? [controls.trigger] : triggers.map((node) => node.id);
		if (controls.trigger && !triggers.some((node) => node.id === controls.trigger)) {
			throw new Error(`"${controls.trigger}" is not an enabled trigger in this flow.`);
		}
		if (startIds.length === 0) throw new Error('Flow has no enabled trigger to start from.');

		const mode = controls.mode ?? options.mode ?? 'live';
		const at = now();
		const state: RunState = {
			id: createRunId(),
			flow: flow.name,
			mode,
			status: 'running',
			startedAt: at,
			updatedAt: at,
			...(controls.payload === undefined ? {} : { trigger: controls.payload }),
			vars: structuredClone({ ...(mode === 'simulate' ? registry.sampleVars : {}), ...flow.vars, ...controls.vars }),
			queue: [...startIds],
			steps: {}
		};
		for (const id of startIds) state.steps[id] = { status: 'pending', attempts: 0, input: controls.payload };
		emit(controls, { type: 'run:start', runId: state.id, at });
		return drive(flow, state, controls);
	}

	/** Continues a run from a waiting step. The snapshot is not mutated. */
	async function resume(input: Flow | unknown, snapshot: RunState, controls: ResumeOptions): Promise<RunState> {
		const flow = prepare(input);
		const state = structuredClone(snapshot);
		const record = state.steps[controls.nodeId];
		const node = flow.nodes.find((n) => n.id === controls.nodeId);
		if (!node) throw new Error(`Step "${controls.nodeId}" is not in this flow.`);
		if (!record || record.status !== 'waiting') {
			throw new Error(`Step "${controls.nodeId}" is not waiting (status: ${record?.status ?? 'not started'}).`);
		}

		state.status = 'running';
		state.updatedAt = now();
		delete state.finishedAt;
		emit(controls, { type: 'run:resume', runId: state.id, nodeId: node.id, at: state.updatedAt });

		if (controls.port !== undefined || controls.output !== undefined) {
			const def = definition(node);
			const ports = controls.port === undefined ? defaultPorts(def, node.id) : [checkPort(def, node.id, controls.port)];
			complete(flow, state, node, record, { ports, output: controls.output }, controls);
		} else {
			record.status = 'pending';
			record.resume = { data: controls.data };
			delete record.wait;
			state.queue.unshift(node.id);
		}
		return drive(flow, state, controls);
	}

	return { registry, start, resume };
}
