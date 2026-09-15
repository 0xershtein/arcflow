import type { Registry } from './registry';
import type { FlowEdge, FlowNode, RunResult } from './types';

export type StepStatus = 'running' | 'success' | 'error' | 'skipped';

export interface RunEvent {
	nodeId: string;
	status: StepStatus;
	message?: string;
	at: number;
}

export interface RunOptions {
	vars?: Record<string, unknown>;
	/** Pause between steps so the run is watchable. */
	stepDelay?: number;
	signal?: AbortSignal;
	onEvent: (event: RunEvent) => void;
	onEdge?: (edgeId: string) => void;
}

export type RunOutcome = 'completed' | 'failed' | 'aborted';

const sleep = (ms: number, signal?: AbortSignal) =>
	new Promise<void>((resolve, reject) => {
		if (signal?.aborted) return reject(new DOMException('Aborted', 'AbortError'));
		const timer = setTimeout(resolve, ms);
		signal?.addEventListener(
			'abort',
			() => {
				clearTimeout(timer);
				reject(new DOMException('Aborted', 'AbortError'));
			},
			{ once: true }
		);
	});

/**
 * Walks the graph from every trigger, breadth-first, calling each definition's `run`.
 * This is a simulation for the editor; a production executor would live server-side.
 */
export async function runFlow(
	nodes: FlowNode[],
	edges: FlowEdge[],
	registry: Registry,
	{ vars = {}, stepDelay = 550, signal, onEvent, onEdge }: RunOptions
): Promise<RunOutcome> {
	const ctx = { vars: structuredClone(vars) };
	const byId = new Map(nodes.map((n) => [n.id, n]));
	const queue = nodes
		.filter((n) => registry.get(n.data.kind)?.trigger)
		.sort((a, b) => a.position.y - b.position.y)
		.map((n) => n.id);
	const visited = new Set<string>();
	let failed = false;

	const emit = (nodeId: string, status: StepStatus, message?: string) =>
		onEvent({ nodeId, status, message, at: Date.now() });

	try {
		while (queue.length) {
			const id = queue.shift()!;
			if (visited.has(id)) continue;
			visited.add(id);

			const node = byId.get(id);
			const def = node && registry.get(node.data.kind);
			if (!node || !def) continue;

			emit(id, 'running');
			await sleep(stepDelay, signal);

			let result: RunResult;
			try {
				result = def.run ? await def.run(node.data.config, ctx) : { next: 'out' };
			} catch (err) {
				result = { status: 'error', message: err instanceof Error ? err.message : String(err) };
			}

			if (result.status === 'error') {
				failed = true;
				emit(id, 'error', result.message);
				continue;
			}
			emit(id, 'success', result.message);

			const ports = result.next === undefined ? [] : Array.isArray(result.next) ? result.next : [result.next];
			for (const edge of edges) {
				if (edge.source !== id || !ports.includes(edge.sourceHandle ?? 'out')) continue;
				onEdge?.(edge.id);
				queue.push(edge.target);
			}
		}
	} catch (err) {
		if (err instanceof DOMException && err.name === 'AbortError') return 'aborted';
		throw err;
	}

	for (const node of nodes) {
		if (!visited.has(node.id)) emit(node.id, 'skipped');
	}
	return failed ? 'failed' : 'completed';
}
