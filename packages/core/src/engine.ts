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
	loop?: { items: unknown[]; concurrency: number; done: boolean[]; results: unknown[] };
	/** State of the sub-flow a call step is running. */
	child?: { flow: string; state: RunState };
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
 * Everything needed to continue a run later. Plain JSON, so it can be stored between `start()` and `resume()`.
 * Step keys are node ids, prefixed inside loops (`each[2]/send`); steps inside sub-flows are addressed
 * through the calling step (`call>approve`).
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

/** Loads flows that call steps refer to by id. */
export interface FlowSource {
	get(id: string): unknown | Promise<unknown>;
}

export interface EngineOptions {
	services?: Services;
	/** Where sub-flows come from. Required for steps that return `{ call }`. */
	flows?: FlowSource;
	/** Default mode for runs (default `live`). */
	mode?: RunMode;
	/** Fail steps whose output is larger than this, in bytes of JSON. Off by default. */
	maxOutputBytes?: number;
	/** How deep sub-flows may call sub-flows (default 10). */
	maxDepth?: number;
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
	/** Key of the waiting step, e.g. `approve`, `each[2]/approve` or `call>approve`. */
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

/** Errors that retrying cannot fix (bad config, unknown port, failed sub-flow). */
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

export interface WaitingStep {
	/** Pass this to `resume({ nodeId })`. */
	key: string;
	nodeId: string;
	reason: string;
	data?: unknown;
}

/** Steps that can be resumed, including steps inside loops and sub-flows (but not the loop or call steps around them). */
export function waitingSteps(state: RunState): WaitingStep[] {
	const found: WaitingStep[] = [];
	for (const [key, step] of Object.entries(state.steps)) {
		if (step.status !== 'waiting' || step.loop) continue;
		if (step.child) {
			for (const inner of waitingSteps(step.child.state)) found.push({ ...inner, key: `${key}>${inner.key}` });
			continue;
		}
		found.push({ key, nodeId: step.nodeId, reason: step.wait?.reason ?? 'waiting', data: step.wait?.data });
	}
	return found;
}

/** The result of a finished flow: the output of its final step, or an object keyed by step when there are several. */
function sinkOutput(steps: Record<string, StepRecord>, scope: string, sinkIds: string[]) {
	const outputs: Record<string, unknown> = {};
	for (const id of sinkIds) {
		const record = steps[joinKey(scope, id)];
		if (record?.status === 'success') outputs[id] = record.output;
	}
	const ids = Object.keys(outputs);
	return ids.length === 1 ? outputs[ids[0]] : ids.length ? outputs : undefined;
}

export type Engine = ReturnType<typeof createEngine>;

interface Run {
	flow: Flow;
	graph: FlowGraph;
	state: RunState;
	controls: RunControls;
	depth: number;
	executed: number;
}

/**
 * Runs flows. Connections deliver data or die (when a branch is not taken), so steps with several
 * incoming connections know when to run (`join`). Loop steps run their body per item in isolated
 * iterations, optionally in parallel. Call steps run sub-flows. Any step can pause the run with
 * `{ wait }`; `resume()` continues it, even inside loops and sub-flows.
 */
export function createEngine<D extends AnyNodeDefinition>(registry: Registry<D>, options: EngineOptions = {}) {
	const now = options.now ?? Date.now;
	const maxDepth = options.maxDepth ?? 10;
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

	async function loadFlow(id: string, key: string): Promise<Flow> {
		if (!options.flows) throw new StepError(`Step "${key}" calls flow "${id}", but the engine has no flows source.`);
		const input = await options.flows.get(id);
		if (input === undefined || input === null) throw new StepError(`No flow "${id}" was found for step "${key}".`);
		try {
			return prepare(input);
		} catch (error) {
			if (error instanceof FlowError) throw new StepError(`Flow "${id}" called by "${key}" is invalid: ${error.message}`);
			throw error;
		}
	}

	const createRun = (flow: Flow, state: RunState, controls: RunControls, depth: number): Run => ({
		flow,
		graph: analyzeFlow(flow, (node) => Boolean(definitionOf(node)?.loop)),
		state,
		controls,
		depth,
		executed: 0
	});

	/** Controls for a sub-flow: same mode, signal and pacing; events are re-keyed under the calling step. */
	const childControls = (run: Run, parentKey: string): RunControls => ({
		mode: run.state.mode,
		signal: run.controls.signal,
		stepDelayMs: run.controls.stepDelayMs,
		maxSteps: run.controls.maxSteps,
		onEvent: (event) => {
			if (event.type === 'run:start' || event.type === 'run:end') return;
			emit(run, { ...event, key: `${parentKey}>${event.key}` });
		}
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

	function checkOutput(key: string, output: unknown) {
		if (output === undefined) return;
		let json: string;
		try {
			json = JSON.stringify(output);
		} catch (error) {
			throw new StepError(`Step "${key}" returned output that is not JSON-serializable: ${error instanceof Error ? error.message : error}`);
		}
		if (options.maxOutputBytes !== undefined) {
			const bytes = new TextEncoder().encode(json).length;
			if (bytes > options.maxOutputBytes) {
				throw new StepError(`Step "${key}" returned ${bytes} bytes of output; the limit is ${options.maxOutputBytes}.`);
			}
		}
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
		delete record.wait;
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

	function markWaiting(run: Run, key: string, record: StepRecord, reason: string, data?: unknown, message?: string) {
		record.status = 'waiting';
		record.wait = { reason, ...(data === undefined ? {} : { data }) };
		if (message) record.message = message;
		run.state.updatedAt = now();
		emit(run, { type: 'step:wait', ...stepBase(run, key), reason, data, message });
	}

	/** Resolves `f.credential` fields through `services.credentials`. Values go to `ctx.secrets` only. */
	async function resolveSecrets(definition: AnyNodeDefinition, config: Record<string, unknown>, key: string, runId: string) {
		const secrets: Record<string, unknown> = {};
		for (const [name, field] of Object.entries(definition.config)) {
			if (field.kind !== 'credential' || typeof config[name] !== 'string') continue;
			const resolver = options.services?.credentials;
			if (!resolver) throw new StepError(`Step "${key}" needs services.credentials to resolve "${name}".`);
			secrets[name] = await resolver.resolve({ id: config[name] as string, type: field.type, runId, nodeId: key });
		}
		return secrets;
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
				const secrets = await resolveSecrets(definition, parsed.value, key, state.id);

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

	async function applyResult(run: Run, scope: string, nodeId: string, record: StepRecord, result: StepResult) {
		const definition = def(run, nodeId);
		const key = joinKey(scope, nodeId);

		if (result && 'wait' in result && result.wait) {
			checkOutput(key, result.wait.data);
			markWaiting(run, key, record, result.wait.reason, result.wait.data, result.message);
			return;
		}

		if (definition.loop) {
			if (!result || !('loop' in result) || !result.loop) throw new StepError(`Loop step "${key}" must return { loop: { items } }.`);
			const items = Array.isArray(result.loop.items) ? [...result.loop.items] : [];
			checkOutput(key, items);
			const concurrency = Math.max(1, Math.floor(Number(result.loop.concurrency) || 1));
			record.loop = { items, concurrency, done: items.map(() => false), results: [] };
			if (result.message) record.message = result.message;
			await runIterations(run, scope, nodeId);
			return;
		}
		if (result && 'loop' in result) throw new StepError(`Step "${key}" is not a loop step and cannot return { loop }.`);

		if (result && 'call' in result && result.call) {
			if (run.depth >= maxDepth) throw new StepError(`Step "${key}" would nest sub-flows more than ${maxDepth} levels deep.`);
			const childFlow = await loadFlow(result.call.flow, key);
			const childState = await startRun(childFlow, { ...childControls(run, key), payload: result.call.input }, run.depth + 1);
			record.child = { flow: result.call.flow, state: childState };
			if (result.message) record.message = result.message;
			settleChild(run, scope, nodeId, record);
			return;
		}

		const value = (result ?? {}) as { port?: string | readonly string[]; output?: unknown; message?: string };
		const ports =
			value.port === undefined
				? defaultPorts(definition, key)
				: (typeof value.port === 'string' ? [value.port] : [...value.port]).map((port) => checkPort(definition, key, port));
		checkOutput(key, value.output);
		complete(run, scope, nodeId, record, { ports, output: value.output, message: value.message });
	}

	/** Moves a call step forward based on its sub-flow's state. Throws `StepError` if the sub-flow failed. */
	function settleChild(run: Run, scope: string, nodeId: string, record: StepRecord) {
		const key = joinKey(scope, nodeId);
		const child = record.child!;
		switch (child.state.status) {
			case 'waiting':
				markWaiting(run, key, record, 'flow', { flow: child.flow, waiting: waitingSteps(child.state).map((step) => `${key}>${step.key}`) });
				return;
			case 'failed':
				throw new StepError(`Flow "${child.flow}" failed: ${child.state.error?.message ?? 'unknown error'}`);
			case 'cancelled':
				throw new CancelledError();
			default: {
				const port = def(run, nodeId).outputs.find((p) => p.id !== 'error')?.id;
				complete(run, scope, nodeId, record, { ports: port ? [port] : [], output: childResult(child.state) });
			}
		}
	}

	/**
	 * Result of a finished sub-flow: the output of the top-level steps where execution ended — those that
	 * succeeded without delivering into another step.
	 */
	function childResult(state: RunState) {
		const delivered = Object.entries(state.scopes[''].edges)
			.filter(([, status]) => status === 'delivered')
			.map(([edgeId]) => edgeId.slice(0, edgeId.indexOf(':')));
		const finals = Object.entries(state.steps)
			.filter(([key, step]) => !key.includes('/') && step.status === 'success' && !delivered.includes(key))
			.map(([key]) => key);
		return sinkOutput(state.steps, '', finals);
	}

	// ---------- Loops ----------

	function iterationResult(run: Run, iterationScope: string) {
		const loopId = loopOfScope(iterationScope);
		const sinks = [...run.graph.bodies.get(loopId)!].filter(
			(id) => run.graph.owner.get(id) === loopId && run.graph.outgoing.get(id)!.length === 0
		);
		return sinkOutput(run.state.steps, iterationScope, sinks);
	}

	async function runIterations(run: Run, scope: string, loopId: string) {
		const { state } = run;
		const loopKey = joinKey(scope, loopId);
		const record = state.steps[loopKey];
		const loop = record.loop!;
		record.status = 'running';
		delete record.wait;
		const itemEdges = run.graph.outgoing.get(loopId)!.filter((edge) => edge.port === 'item');
		const scopeOf = (index: number) => `${loopKey}[${index}]`;

		const runIteration = async (index: number) => {
			const iterationScope = scopeOf(index);
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
			if (state.status === 'running' && state.scopes[iterationScope].status === 'done') {
				loop.results[index] = iterationResult(run, iterationScope);
				loop.done[index] = true;
			}
		};

		// An iteration occupies a slot from the moment it starts until it is done — waiting included — so
		// `concurrency: 1` keeps iterations strictly one after another even when they pause.
		const started = (index: number) => Boolean(state.scopes[scopeOf(index)]);
		const notStarted = loop.items.map((_, index) => index).filter((index) => !started(index));
		const occupied = loop.items.filter((_, index) => started(index) && !loop.done[index]).length;
		const free = Math.max(0, loop.concurrency - occupied);
		const workers = Array.from({ length: Math.min(free, notStarted.length) }, async () => {
			while (notStarted.length && state.status === 'running') {
				const index = notStarted.shift()!;
				await runIteration(index);
				if (!loop.done[index]) return; // still waiting: this slot stays taken
			}
		});
		await Promise.all(workers);
		if (state.status !== 'running') return;

		const waiting = loop.items.map((_, index) => scopeOf(index)).filter((key) => state.scopes[key]?.status === 'waiting');
		if (waiting.length) {
			const steps = Object.keys(state.steps).filter(
				(key) => waiting.some((prefix) => key.startsWith(`${prefix}/`)) && state.steps[key].status === 'waiting' && !state.steps[key].loop
			);
			markWaiting(run, loopKey, record, 'loop', { waiting: steps });
			return;
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
			if (state.status !== 'running') return;
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

	async function startRun(flow: Flow, controls: StartOptions, depth: number): Promise<RunState> {
		const triggers = flow.nodes.filter((node) => !node.disabled && registry.get(node.kind)?.trigger);
		if (controls.trigger && !triggers.some((node) => node.id === controls.trigger)) {
			throw new Error(`"${controls.trigger}" is not an enabled trigger in this flow.`);
		}
		const startIds = controls.trigger ? [controls.trigger] : triggers.map((node) => node.id);
		if (startIds.length === 0) throw new StepError(`Flow "${flow.name}" has no enabled trigger to start from.`);

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

		const run = createRun(flow, state, controls, depth);
		emit(run, { type: 'run:start', runId: state.id, at });
		return guarded(run, () => driveScope(run, ''));
	}

	/** Starts a run and resolves when it completes, fails, is cancelled, or waits. */
	async function start(input: Flow | unknown, controls: StartOptions = {}): Promise<RunState> {
		const flow = prepare(input);
		try {
			return await startRun(flow, controls, 0);
		} catch (error) {
			if (error instanceof StepError) throw new Error(error.message);
			throw error;
		}
	}

	async function resumeFlow(flow: Flow, state: RunState, controls: ResumeOptions, depth: number): Promise<RunState> {
		const fullKey = controls.nodeId;
		const arrow = fullKey.indexOf('>');
		const key = arrow === -1 ? fullKey : fullKey.slice(0, arrow);
		const record = state.steps[key];
		const { scope, nodeId } = splitStepKey(key);

		if (!flow.nodes.some((node) => node.id === nodeId)) throw new Error(`Step "${nodeId}" is not in this flow.`);
		if (!record || record.status !== 'waiting') {
			throw new Error(`Step "${key}" is not waiting (status: ${record?.status ?? 'not started'}).`);
		}
		const inner = (record.wait?.data as { waiting?: string[] } | undefined)?.waiting ?? [];
		if (record.loop) throw new Error(`"${key}" is a loop; resume the waiting step inside it: ${inner.join(', ')}.`);
		if (record.child && arrow === -1) throw new Error(`"${key}" runs a sub-flow; resume the waiting step inside it: ${inner.join(', ')}.`);
		if (!record.child && arrow !== -1) throw new Error(`"${key}" is not running a sub-flow.`);

		const run = createRun(flow, state, controls, depth);
		state.status = 'running';
		state.updatedAt = now();
		delete state.finishedAt;
		emit(run, { type: 'run:resume', ...stepBase(run, fullKey) });

		return guarded(run, async () => {
			if (record.child) {
				try {
					const childFlow = await loadFlow(record.child.flow, key);
					record.child.state = await resumeFlow(
						childFlow,
						record.child.state,
						{ ...childControls(run, key), nodeId: fullKey.slice(arrow + 1), port: controls.port, output: controls.output, data: controls.data },
						depth + 1
					);
					settleChild(run, scope, nodeId, record);
				} catch (error) {
					if (!(error instanceof StepError)) throw error;
					failStep(run, scope, nodeId, record, error.message);
				}
				if (record.status === 'waiting') return;
			} else if (controls.port !== undefined || controls.output !== undefined) {
				const definition = def(run, nodeId);
				const ports = controls.port === undefined ? defaultPorts(definition, key) : [checkPort(definition, key, controls.port)];
				complete(run, scope, nodeId, record, { ports, output: controls.output });
			} else {
				record.status = 'pending';
				record.resume = { data: controls.data };
				delete record.wait;
				state.scopes[scope].queue.unshift(nodeId);
			}
			if (state.status !== 'running') return;
			await driveScope(run, scope);

			// Finish the loops around the resumed step, innermost first.
			let current = scope;
			while (current && state.status === 'running' && state.scopes[current].status === 'done') {
				const iteration = state.scopes[current];
				const loopKey = iteration.loop!;
				const { scope: parent, nodeId: loopId } = splitStepKey(loopKey);
				const loopRecord = state.steps[loopKey];
				loopRecord.loop!.results[iteration.index!] = iterationResult(run, current);
				loopRecord.loop!.done[iteration.index!] = true;
				await runIterations(run, parent, loopId);
				if (loopRecord.status === 'waiting' || state.status !== 'running') break;
				await driveScope(run, parent);
				current = parent;
			}
		});
	}

	/**
	 * Continues a run from a waiting step — use a key from `waitingSteps(state)`, which may point inside
	 * loops (`each[2]/approve`) or sub-flows (`call>approve`). The snapshot is not mutated.
	 */
	async function resume(input: Flow | unknown, snapshot: RunState, controls: ResumeOptions): Promise<RunState> {
		return resumeFlow(prepare(input), structuredClone(snapshot), controls, 0);
	}

	return { registry, start, resume };
}
