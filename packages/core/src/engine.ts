import { ExpressionError, resolveTemplates } from './expressions.js';
import type { Flow, FlowNode } from './flow.js';
import { analyzeFlow, type FlowGraph } from './graph.js';
import { FlowError, formatIssues } from './issues.js';
import type { AnyNodeDefinition, NodeContext, RunMode, Services, StepResult, StepView } from './node.js';
import type { Registry } from './registry.js';
import { parseShape } from './schema.js';

export type StepStatus = 'pending' | 'running' | 'success' | 'waiting' | 'error' | 'skipped';
export type RunStatus = 'running' | 'waiting' | 'completed' | 'failed' | 'cancelled';

export interface StepLog {
	at: number;
	message: string;
	data?: unknown;
}

export interface StepRecord {
	nodeId: string;
	status: StepStatus;
	attempts: number;
	input?: unknown;
	inputs?: Record<string, unknown>;
	output?: unknown;
	ports?: string[];
	message?: string;
	error?: string;
	wait?: { reason: string; data?: unknown };
	/** Pending resume data, consumed when the step runs again. */
	resume?: { data: unknown };
	/** Progress of a loop step. */
	loop?: { items: unknown[]; next: number; results: unknown[] };
	logs?: StepLog[];
	startedAt?: number;
	finishedAt?: number;
}

/** Bookkeeping for the top level (`''`) or one loop iteration (`each[2]`). */
export interface ScopeState {
	status: 'running' | 'waiting' | 'done';
	/** Node ids ready to run. */
	queue: string[];
	/** Connections that have delivered data or will never deliver. */
	edges: Record<string, 'delivered' | 'dead'>;
	/** Data waiting at a step: target node id → source node id → value. */
	inbox: Record<string, Record<string, unknown>>;
	/** Key of the loop step that owns this iteration. */
	loop?: string;
	index?: number;
	item?: unknown;
}

/**
 * Everything needed to continue a run later. Plain JSON as long as step outputs are,
 * so it can be stored in a database between `start()` and `resume()`.
 * Step keys are node ids, prefixed inside loops: `each[2]/send`.
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
	scopes: Record<string, ScopeState>;
	steps: Record<string, StepRecord>;
	error?: { message: string; nodeId?: string; key?: string };
}

type Base = { runId: string; at: number };
type StepBase = Base & { nodeId: string; key: string };
export type RunEvent =
	| (Base & { type: 'run:start' })
	| (StepBase & { type: 'run:resume' })
	| (StepBase & { type: 'step:start'; attempt: number })
	| (StepBase & { type: 'step:log'; message: string; data?: unknown })
	| (StepBase & { type: 'step:retry'; attempt: number; error: string })
	| (StepBase & { type: 'step:success'; ports: string[]; output?: unknown; message?: string })
	| (StepBase & { type: 'step:wait'; reason: string; data?: unknown; message?: string })
	| (StepBase & { type: 'step:error'; error: string; handled: boolean })
	| (StepBase & { type: 'step:skip' })
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
	/** Safety limit on executed steps per call (default 10 000). */
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
	/** Key of the waiting step, e.g. `approve` or `each[2]/approve`. */
	nodeId: string;
	/** Finish the waiting step directly with this port (and optional output) … */
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

function withTimeout<T>(promise: Promise<T>, ms: number | undefined, key: string): Promise<T> {
	if (!ms) return promise;
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<never>((_, reject) => {
		timer = setTimeout(() => reject(new Error(`Step "${key}" timed out after ${ms} ms.`)), ms);
	});
	return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** `each[2]/send` → `{ scope: 'each[2]', nodeId: 'send' }` */
export function splitStepKey(key: string) {
	const slash = key.lastIndexOf('/');
	return slash === -1 ? { scope: '', nodeId: key } : { scope: key.slice(0, slash), nodeId: key.slice(slash + 1) };
}

const joinKey = (scope: string, nodeId: string) => (scope ? `${scope}/${nodeId}` : nodeId);

/** `outer[1]/inner[0]` → `inner` */
const loopOfScope = (scope: string) => {
	const last = scope.slice(scope.lastIndexOf('/') + 1);
	return last.slice(0, last.indexOf('['));
};

/** Steps currently waiting for `resume()`, innermost first-class steps only (not the loops around them). */
export function waitingSteps(state: RunState) {
	return Object.entries(state.steps)
		.filter(([, step]) => step.status === 'waiting' && !step.loop)
		.map(([key, step]) => ({ key, nodeId: step.nodeId, reason: step.wait?.reason ?? 'waiting', data: step.wait?.data }));
}

export type Engine = ReturnType<typeof createEngine>;

interface Run {
	flow: Flow;
	graph: FlowGraph;
	state: RunState;
	controls: RunControls;
	executed: number;
}

/**
 * Runs flows. Connections deliver data or die (when a branch is not taken), so steps with several
 * incoming connections know when to run (`join`). Loop steps run their body per item in isolated
 * iterations. Any step can pause the run with `{ wait }`; `resume()` continues it, even inside loops.
 */
export function createEngine<D extends AnyNodeDefinition>(registry: Registry<D>, options: EngineOptions = {}) {
	const now = options.now ?? Date.now;
	const createRunId =
		options.createRunId ??
		(() => globalThis.crypto?.randomUUID?.() ?? `run_${now().toString(36)}${Math.random().toString(36).slice(2, 10)}`);

	const definitionOf = (node: FlowNode) => registry.get(node.kind) as AnyNodeDefinition;
	const def = (run: Run, nodeId: string) => definitionOf(run.graph.byId.get(nodeId)!);

	function emit(run: Run, event: RunEvent) {
		try {
			run.controls.onEvent?.(event);
		} catch {
			// a failing listener must not break the run
		}
	}

	const stepBase = (run: Run, key: string) => ({ runId: run.state.id, key, nodeId: splitStepKey(key).nodeId, at: now() });

	function prepare(input: Flow | unknown): Flow {
		const parsed = registry.parse(input);
		if (!parsed.ok) {
			const errors = parsed.issues.filter((issue) => issue.level === 'error');
			throw new FlowError(`Flow cannot run:\n${formatIssues(errors)}`, parsed.issues);
		}
		return parsed.flow;
	}

	const createRun = (flow: Flow, state: RunState, controls: RunControls): Run => ({
		flow,
		graph: analyzeFlow(flow, (node) => Boolean(definitionOf(node)?.loop)),
		state,
		controls,
		executed: 0
	});

	function defaultPorts(definition: AnyNodeDefinition, key: string) {
		if (definition.outputs.length <= 1) return definition.outputs.map((port) => port.id);
		throw new StepError(
			`Step "${key}" (${definition.kind}) has several outputs and must return a port: ${definition.outputs.map((p) => p.id).join(', ')}.`
		);
	}

	function checkPort(definition: AnyNodeDefinition, key: string, port: string) {
		if (!definition.outputs.some((p) => p.id === port)) {
			throw new StepError(`Step "${key}" returned unknown port "${port}" (outputs: ${definition.outputs.map((p) => p.id).join(', ')}).`);
		}
		return port;
	}

	/** Finished steps visible from a scope: its own and those of the scopes around it. */
	function stepsView(run: Run, scope: string): Record<string, StepView> {
		const chain = [''];
		if (scope) {
			const parts = scope.split('/');
			for (let i = 1; i <= parts.length; i++) chain.push(parts.slice(0, i).join('/'));
		}
		const view: Record<string, StepView> = {};
		for (const [key, record] of Object.entries(run.state.steps)) {
			if (!chain.includes(splitStepKey(key).scope)) continue;
			if (record.status === 'success' || record.status === 'waiting' || record.status === 'error') {
				view[record.nodeId] = { status: record.status, output: record.output };
			}
		}
		return view;
	}

	function hasWaiting(run: Run, scope: string) {
		return Object.entries(run.state.steps).some(([key, record]) => record.status === 'waiting' && splitStepKey(key).scope === scope);
	}

	// ---------- Connections ----------

	function deliver(run: Run, scope: string, from: string, ports: string[], value: unknown) {
		const scopeState = run.state.scopes[scope];
		const fromLoop = def(run, from).loop;
		for (const edge of run.graph.outgoing.get(from)!) {
			if (fromLoop && edge.port === 'item') continue; // feeds iterations, not this scope
			if (scopeState.edges[edge.id]) continue;
			const delivered = ports.includes(edge.port);
			scopeState.edges[edge.id] = delivered ? 'delivered' : 'dead';
			if (delivered) (scopeState.inbox[edge.to] ??= {})[from] = value;
			settle(run, scope, edge.to);
		}
	}

	function settle(run: Run, scope: string, nodeId: string) {
		const { state } = run;
		const key = joinKey(scope, nodeId);
		if (state.steps[key]) return;
		const scopeState = state.scopes[scope];
		const incoming = run.graph.incoming.get(nodeId)!;
		const delivered = incoming.filter((edge) => scopeState.edges[edge.id] === 'delivered');
		const settled = incoming.every((edge) => scopeState.edges[edge.id]);
		const join = run.graph.byId.get(nodeId)!.join ?? def(run, nodeId).join ?? 'any';

		if (delivered.length > 0 && (join === 'any' || settled)) {
			const inputs = { ...scopeState.inbox[nodeId] };
			delete scopeState.inbox[nodeId];
			const values = delivered.map((edge) => inputs[edge.from]);
			state.steps[key] = {
				nodeId,
				status: 'pending',
				attempts: 0,
				input: join === 'all' && values.length > 1 ? values : values[0],
				inputs
			};
			scopeState.queue.push(nodeId);
		} else if (settled) {
			skip(run, scope, nodeId);
		}
	}

	function skip(run: Run, scope: string, nodeId: string) {
		const key = joinKey(scope, nodeId);
		run.state.steps[key] = { nodeId, status: 'skipped', attempts: 0 };
		emit(run, { type: 'step:skip', ...stepBase(run, key) });
		deliver(run, scope, nodeId, [], undefined);
	}

	// ---------- Step lifecycle ----------

	function complete(run: Run, scope: string, nodeId: string, record: StepRecord, result: { ports: string[]; output?: unknown; message?: string }) {
		const { state } = run;
		const key = joinKey(scope, nodeId);
		record.status = 'success';
		record.ports = result.ports;
		record.finishedAt = state.updatedAt = now();
		if (result.output !== undefined) record.output = result.output;
		if (result.message) record.message = result.message;
		delete record.wait;
		delete record.error;
		emit(run, { type: 'step:success', ...stepBase(run, key), ports: result.ports, output: result.output, message: result.message });
		// Steps without output pass their input along.
		deliver(run, scope, nodeId, result.ports, result.output !== undefined ? result.output : record.input);
	}

	function failStep(run: Run, scope: string, nodeId: string, record: StepRecord, message: string) {
		const { state } = run;
		const key = joinKey(scope, nodeId);
		const definition = def(run, nodeId);
		record.status = 'error';
		record.error = message;
		record.finishedAt = state.updatedAt = now();
		const handled =
			definition.outputs.some((p) => p.id === 'error') && run.graph.outgoing.get(nodeId)!.some((edge) => edge.port === 'error');
		emit(run, { type: 'step:error', ...stepBase(run, key), error: message, handled });
		if (handled) {
			record.ports = ['error'];
			deliver(run, scope, nodeId, ['error'], { error: message, input: record.input });
			return;
		}
		state.status = 'failed';
		state.error = { message, nodeId, ...(key !== nodeId ? { key } : {}) };
	}

	async function execute(run: Run, scope: string, nodeId: string, record: StepRecord) {
		const { state, controls } = run;
		const node = run.graph.byId.get(nodeId)!;
		const definition = def(run, nodeId);
		const key = joinKey(scope, nodeId);

		record.status = 'running';
		record.startedAt = state.updatedAt = now();
		const resumed = record.resume;
		delete record.resume;

		if (controls.stepDelayMs) await sleep(controls.stepDelayMs, controls.signal);

		if (node.disabled) {
			const ports = definition.loop ? ['done'] : definition.outputs.length ? [definition.outputs[0].id] : [];
			complete(run, scope, nodeId, record, { ports, message: 'Disabled — passed through' });
			return;
		}

		const handler = state.mode === 'simulate' ? (definition.simulate ?? definition.run) : definition.run;
		const attempts = Math.max(1, definition.retry?.attempts ?? 1);
		const iteration = scope ? state.scopes[scope] : undefined;
		let lastError = 'Unknown error';

		for (let attempt = 1; attempt <= attempts; attempt++) {
			record.attempts = attempt;
			emit(run, { type: 'step:start', ...stepBase(run, key), attempt });
			let result: StepResult;
			try {
				const steps = stepsView(run, scope);
				const scopeValues = {
					vars: state.vars,
					steps,
					input: record.input,
					inputs: record.inputs ?? {},
					trigger: state.trigger,
					run: { id: state.id, mode: state.mode },
					$item: iteration?.item,
					$index: iteration?.index,
					$now: new Date(now()).toISOString()
				};
				const parsed = parseShape(definition.config, resolveTemplates(node.config, scopeValues));
				const errors = parsed.issues.filter((issue) => issue.level === 'error');
				if (errors.length) throw new StepError(errors.map((issue) => `${issue.path}: ${issue.message}`).join(' '));
				const secrets = await resolveSecretsFor(definition, parsed.value, key, state.id);

				const ctx: NodeContext = {
					config: parsed.value,
					input: record.input,
					inputs: record.inputs ?? {},
					vars: state.vars,
					steps,
					secrets,
					item: iteration?.item,
					index: iteration?.index,
					services: options.services ?? {},
					mode: state.mode,
					runId: state.id,
					nodeId,
					key,
					attempt,
					signal: controls.signal ?? neverAborted,
					resumed,
					log: (message, data) => {
						const entry: StepLog = { at: now(), message, ...(data === undefined ? {} : { data }) };
						(record.logs ??= []).push(entry);
						emit(run, { type: 'step:log', ...stepBase(run, key), message, data });
					}
				};
				result = handler ? await withTimeout(Promise.resolve().then(() => handler.call(definition, ctx)), definition.timeoutMs, key) : undefined;
			} catch (error) {
				if (error instanceof CancelledError || controls.signal?.aborted) throw new CancelledError();
				lastError = error instanceof Error ? error.message : String(error);
				if (error instanceof StepError || error instanceof ExpressionError || attempt === attempts) break;
				emit(run, { type: 'step:retry', ...stepBase(run, key), attempt, error: lastError });
				const delay = (definition.retry?.delayMs ?? 0) * (definition.retry?.factor ?? 2) ** (attempt - 1);
				if (delay) await sleep(delay, controls.signal);
				continue;
			}

			try {
				await applyResult(run, scope, nodeId, record, result);
			} catch (error) {
				if (!(error instanceof StepError)) throw error;
				failStep(run, scope, nodeId, record, error.message);
			}
			return;
		}
		failStep(run, scope, nodeId, record, lastError);
	}

	/** Resolves `f.credential` fields through `services.credentials`. Values go to `ctx.secrets` only. */
	async function resolveSecretsFor(definition: AnyNodeDefinition, config: Record<string, unknown>, key: string, runId: string) {
		const secrets: Record<string, unknown> = {};
		for (const [name, field] of Object.entries(definition.config)) {
			if (field.kind !== 'credential' || typeof config[name] !== 'string') continue;
			const resolver = options.services?.credentials;
			if (!resolver) throw new StepError(`Step "${key}" needs services.credentials to resolve "${name}".`);
			secrets[name] = await resolver.resolve({ id: config[name] as string, type: field.type, runId, nodeId: key });
		}
		return secrets;
	}

	async function applyResult(run: Run, scope: string, nodeId: string, record: StepRecord, result: StepResult) {
		const { state } = run;
		const definition = def(run, nodeId);
		const key = joinKey(scope, nodeId);

		if (result && 'wait' in result && result.wait) {
			record.status = 'waiting';
			record.wait = { reason: result.wait.reason, ...(result.wait.data === undefined ? {} : { data: result.wait.data }) };
			if (result.message) record.message = result.message;
			state.updatedAt = now();
			emit(run, { type: 'step:wait', ...stepBase(run, key), reason: result.wait.reason, data: result.wait.data, message: result.message });
			return;
		}

		if (definition.loop) {
			if (!result || !('loop' in result) || !result.loop) throw new StepError(`Loop step "${key}" must return { loop: { items } }.`);
			record.loop = { items: Array.isArray(result.loop.items) ? [...result.loop.items] : [], next: 0, results: [] };
			if (result.message) record.message = result.message;
			await runIterations(run, scope, nodeId);
			return;
		}
		if (result && 'loop' in result) throw new StepError(`Step "${key}" is not a loop step and cannot return { loop }.`);

		const value = (result ?? {}) as { port?: string | readonly string[]; output?: unknown; message?: string };
		const ports =
			value.port === undefined
				? defaultPorts(definition, key)
				: (typeof value.port === 'string' ? [value.port] : [...value.port]).map((port) => checkPort(definition, key, port));
		complete(run, scope, nodeId, record, { ports, output: value.output, message: value.message });
	}

	// ---------- Loops ----------

	function iterationResult(run: Run, iterationScope: string) {
		const loopId = loopOfScope(iterationScope);
		const sinks = [...run.graph.bodies.get(loopId)!].filter(
			(id) => run.graph.owner.get(id) === loopId && run.graph.outgoing.get(id)!.length === 0
		);
		const outputs: Record<string, unknown> = {};
		for (const id of sinks) {
			const record = run.state.steps[joinKey(iterationScope, id)];
			if (record?.status === 'success') outputs[id] = record.output;
		}
		const ids = Object.keys(outputs);
		return ids.length === 1 ? outputs[ids[0]] : ids.length ? outputs : undefined;
	}

	async function runIterations(run: Run, scope: string, loopId: string) {
		const { state } = run;
		const loopKey = joinKey(scope, loopId);
		const record = state.steps[loopKey];
		const loop = record.loop!;
		record.status = 'running';
		delete record.wait;
		const itemEdges = run.graph.outgoing.get(loopId)!.filter((edge) => edge.port === 'item');

		while (loop.next < loop.items.length) {
			const index = loop.next;
			const iterationScope = `${loopKey}[${index}]`;
			if (!state.scopes[iterationScope]) {
				const item = loop.items[index];
				state.scopes[iterationScope] = { status: 'running', queue: [], edges: {}, inbox: {}, loop: loopKey, index, item };
				for (const edge of itemEdges) {
					state.scopes[iterationScope].edges[edge.id] = 'delivered';
					(state.scopes[iterationScope].inbox[edge.to] ??= {})[loopId] = item;
					settle(run, iterationScope, edge.to);
				}
			}
			await driveScope(run, iterationScope);
			if (state.status === 'failed') return;
			if (state.scopes[iterationScope].status === 'waiting') {
				record.status = 'waiting';
				const waiting = Object.keys(state.steps).filter((key) => key.startsWith(`${iterationScope}/`) && state.steps[key].status === 'waiting');
				record.wait = { reason: 'loop', data: { index, waiting } };
				emit(run, { type: 'step:wait', ...stepBase(run, loopKey), reason: 'loop', data: record.wait.data });
				return;
			}
			loop.results[index] = iterationResult(run, iterationScope);
			loop.next = index + 1;
		}

		complete(run, scope, loopId, record, {
			ports: ['done'],
			output: loop.results,
			message: `${loop.items.length} ${loop.items.length === 1 ? 'item' : 'items'}`
		});
	}

	// ---------- Driving ----------

	async function driveScope(run: Run, scope: string) {
		const { state, controls } = run;
		const scopeState = state.scopes[scope];
		scopeState.status = 'running';
		const maxSteps = controls.maxSteps ?? 10_000;
		while (scopeState.queue.length) {
			if (controls.signal?.aborted) throw new CancelledError();
			const nodeId = scopeState.queue.shift()!;
			const record = state.steps[joinKey(scope, nodeId)];
			if (!record || record.status !== 'pending') continue;
			if (++run.executed > maxSteps) {
				state.status = 'failed';
				state.error = { message: `Run stopped after ${maxSteps} steps.`, nodeId };
				return;
			}
			await execute(run, scope, nodeId, record);
			if (state.status === 'failed') return;
		}
		scopeState.status = hasWaiting(run, scope) ? 'waiting' : 'done';
	}

	function finish(run: Run): RunState {
		const { state, flow } = run;
		const at = now();
		if (state.status === 'running') {
			state.status = Object.values(state.steps).some((step) => step.status === 'waiting') ? 'waiting' : 'completed';
		}
		if (state.status !== 'waiting') {
			for (const scope of Object.values(state.scopes)) {
				scope.queue = [];
				scope.status = 'done';
			}
			for (const [key, record] of Object.entries(state.steps)) {
				if (record.status === 'running') {
					record.status = 'error';
					record.error = 'Cancelled';
					record.finishedAt = at;
				} else if (record.status === 'pending') {
					record.status = 'skipped';
					emit(run, { type: 'step:skip', ...stepBase(run, key) });
				}
			}
			const seen = new Set(Object.values(state.steps).map((record) => record.nodeId));
			for (const node of flow.nodes) {
				if (seen.has(node.id)) continue;
				state.steps[node.id] = { nodeId: node.id, status: 'skipped', attempts: 0 };
				emit(run, { type: 'step:skip', ...stepBase(run, node.id) });
			}
			state.finishedAt = at;
		}
		state.updatedAt = at;
		emit(run, { type: 'run:end', runId: state.id, status: state.status, error: state.error?.message, at });
		return state;
	}

	async function guarded(run: Run, work: () => Promise<void>) {
		try {
			await work();
		} catch (error) {
			if (!(error instanceof CancelledError)) throw error;
			run.state.status = 'cancelled';
		}
		return finish(run);
	}

	/** Starts a run and resolves when it completes, fails, is cancelled, or waits. */
	async function start(input: Flow | unknown, controls: StartOptions = {}): Promise<RunState> {
		const flow = prepare(input);
		const triggers = flow.nodes.filter((node) => !node.disabled && registry.get(node.kind)?.trigger);
		if (controls.trigger && !triggers.some((node) => node.id === controls.trigger)) {
			throw new Error(`"${controls.trigger}" is not an enabled trigger in this flow.`);
		}
		const startIds = controls.trigger ? [controls.trigger] : triggers.map((node) => node.id);
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
			scopes: { '': { status: 'running', queue: [...startIds], edges: {}, inbox: {} } },
			steps: {}
		};
		for (const id of startIds) state.steps[id] = { nodeId: id, status: 'pending', attempts: 0, input: controls.payload };

		const run = createRun(flow, state, controls);
		emit(run, { type: 'run:start', runId: state.id, at });
		return guarded(run, () => driveScope(run, ''));
	}

	/** Continues a run from a waiting step, including steps inside loops. The snapshot is not mutated. */
	async function resume(input: Flow | unknown, snapshot: RunState, controls: ResumeOptions): Promise<RunState> {
		const flow = prepare(input);
		const state = structuredClone(snapshot);
		const key = controls.nodeId;
		const record = state.steps[key];
		const { scope, nodeId } = splitStepKey(key);

		if (!flow.nodes.some((node) => node.id === nodeId)) throw new Error(`Step "${nodeId}" is not in this flow.`);
		if (!record || record.status !== 'waiting') {
			throw new Error(`Step "${key}" is not waiting (status: ${record?.status ?? 'not started'}).`);
		}
		if (record.loop) {
			const inner = (record.wait?.data as { waiting?: string[] } | undefined)?.waiting ?? [];
			throw new Error(`"${key}" is a loop; resume the waiting step inside it: ${inner.join(', ')}.`);
		}

		const run = createRun(flow, state, controls);
		state.status = 'running';
		state.updatedAt = now();
		delete state.finishedAt;
		emit(run, { type: 'run:resume', ...stepBase(run, key) });

		return guarded(run, async () => {
			if (controls.port !== undefined || controls.output !== undefined) {
				const definition = def(run, nodeId);
				const ports = controls.port === undefined ? defaultPorts(definition, key) : [checkPort(definition, key, controls.port)];
				complete(run, scope, nodeId, record, { ports, output: controls.output });
			} else {
				record.status = 'pending';
				record.resume = { data: controls.data };
				delete record.wait;
				state.scopes[scope].queue.unshift(nodeId);
			}
			await driveScope(run, scope);

			// Finish the loops around the resumed step, innermost first.
			let current = scope;
			while (current && state.status === 'running' && state.scopes[current].status === 'done') {
				const iteration = state.scopes[current];
				const loopKey = iteration.loop!;
				const { scope: parent, nodeId: loopId } = splitStepKey(loopKey);
				const loopRecord = state.steps[loopKey];
				loopRecord.loop!.results[iteration.index!] = iterationResult(run, current);
				loopRecord.loop!.next = iteration.index! + 1;
				await runIterations(run, parent, loopId);
				if (loopRecord.status === 'waiting' || state.status !== 'running') break;
				await driveScope(run, parent);
				current = parent;
			}
		});
	}

	return { registry, start, resume };
}
