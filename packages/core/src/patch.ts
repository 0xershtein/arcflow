import { edgeId, type Flow, type FlowEdge, type FlowNode, ID_PATTERN } from './flow.js';

/**
 * Changing one field of a flow without rewriting the document.
 *
 * `set` and `remove` take the same paths validation reports, so the answer to
 * `error required @ nodes[1].config.url` is a patch at that exact path. A node
 * may also be addressed by id — `nodes[fetch].config.url` — which survives
 * reordering and is what a model should prefer.
 */
export type PatchOp =
	| { op: 'set'; path: string; value: unknown }
	| { op: 'remove'; path: string }
	| { op: 'addNode'; node: PatchNode; after?: string; port?: string }
	| { op: 'removeNode'; id: string }
	| { op: 'connect'; from: string; to: string; port?: string }
	| { op: 'disconnect'; from: string; to: string; port?: string };

export interface PatchNode {
	id: string;
	kind: string;
	label?: string;
	config?: Record<string, unknown>;
	position?: { x: number; y: number };
}

export interface PatchFailure {
	/** Index of the operation in the list that was handed in. */
	index: number;
	op: PatchOp;
	message: string;
}

export interface PatchResult {
	/** The patched flow, or the flow exactly as it came in when anything failed. */
	flow: Flow;
	applied: boolean;
	failures: PatchFailure[];
}

type Segment = { key: string; kind: 'key' } | { key: string; kind: 'index' };

/** `nodes[1].config.url` and `nodes[fetch].config.url` both parse; so does `a.b[0].c`. */
const PATH_PATTERN = /^[A-Za-z0-9_$-]+(\.[A-Za-z0-9_$-]+|\[[^\].]+\])*$/;

function parsePath(path: string): Segment[] | null {
	// Checked whole first, so a missing or doubled separator is rejected rather than skipped.
	if (!PATH_PATTERN.test(path)) return null;
	const segments: Segment[] = [];
	const pattern = /([A-Za-z0-9_$-]+)|\[([^\]]+)\]/g;
	let match: RegExpExecArray | null;
	while ((match = pattern.exec(path))) {
		if (match[1] !== undefined) segments.push({ key: match[1], kind: 'key' });
		else segments.push({ key: match[2], kind: 'index' });
	}
	return segments.length > 0 ? segments : null;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

/** Arrays of nodes and edges accept an id in the brackets as well as a position. */
function indexIn(list: unknown[], key: string): number {
	const asNumber = Number(key);
	if (Number.isInteger(asNumber) && String(asNumber) === key) return asNumber;
	return list.findIndex((item) => isObject(item) && item.id === key);
}

function walk(root: Flow, segments: Segment[]): { parent: unknown; key: string | number } | string {
	let current: unknown = root;
	for (let i = 0; i < segments.length - 1; i++) {
		const segment = segments[i];
		if (Array.isArray(current)) {
			const index = indexIn(current, segment.key);
			if (index < 0 || index >= current.length) return `there is nothing at "${segment.key}".`;
			current = current[index];
		} else if (isObject(current)) {
			if (!(segment.key in current)) return `"${segment.key}" does not exist here.`;
			current = current[segment.key];
		} else {
			return `"${segment.key}" cannot be read: the value before it is not an object.`;
		}
	}
	const last = segments[segments.length - 1];
	if (Array.isArray(current)) {
		const index = indexIn(current, last.key);
		if (index < 0) return `there is nothing at "${last.key}".`;
		return { parent: current, key: index };
	}
	if (isObject(current)) return { parent: current, key: last.key };
	return `"${last.key}" cannot be set: the value before it is not an object.`;
}

function edgesTouching(flow: Flow, id: string): FlowEdge[] {
	return flow.edges.filter((edge) => edge.from === id || edge.to === id);
}

/**
 * Applies operations to a flow and returns a new one. All or nothing: when any
 * operation fails, the flow comes back untouched with every failure listed, so a
 * half-applied edit can never reach the canvas.
 */
export function applyPatch(flow: Flow, ops: readonly PatchOp[]): PatchResult {
	const next: Flow = JSON.parse(JSON.stringify(flow));
	const failures: PatchFailure[] = [];
	const fail = (index: number, op: PatchOp, message: string) => failures.push({ index, op, message });

	ops.forEach((op, index) => {
		if (failures.length) return;
		switch (op.op) {
			case 'set':
			case 'remove': {
				const segments = parsePath(op.path);
				if (!segments) return fail(index, op, `"${op.path}" is not a path. Paths look like nodes[1].config.url.`);
				const found = walk(next, segments);
				if (typeof found === 'string') return fail(index, op, `Cannot reach ${op.path}: ${found}`);
				const { parent, key } = found;
				if (op.op === 'set') {
					if (Array.isArray(parent)) parent[key as number] = op.value;
					else (parent as Record<string, unknown>)[key as string] = op.value;
					return;
				}
				if (Array.isArray(parent)) parent.splice(key as number, 1);
				else delete (parent as Record<string, unknown>)[key as string];
				return;
			}
			case 'addNode': {
				const node = op.node;
				if (!node?.id || !ID_PATTERN.test(node.id)) return fail(index, op, `"${node?.id}" is not a usable id: letters, digits, "-" and "_" only.`);
				if (next.nodes.some((existing) => existing.id === node.id)) return fail(index, op, `A step called "${node.id}" is already here.`);
				if (!node.kind) return fail(index, op, 'A step needs a kind.');
				const added: FlowNode = { id: node.id, kind: node.kind, config: node.config ?? {} };
				if (node.label !== undefined) added.label = node.label;
				if (node.position !== undefined) added.position = node.position;
				next.nodes.push(added);
				if (op.after === undefined) return;
				const source = next.nodes.find((existing) => existing.id === op.after);
				if (!source) return fail(index, op, `There is no step called "${op.after}" to connect from.`);
				next.edges.push(connection(op.after, op.port ?? 'out', node.id));
				return;
			}
			case 'removeNode': {
				const at = next.nodes.findIndex((node) => node.id === op.id);
				if (at < 0) return fail(index, op, `There is no step called "${op.id}".`);
				next.nodes.splice(at, 1);
				// A step cannot leave its connections behind; they would dangle.
				next.edges = next.edges.filter((edge) => edge.from !== op.id && edge.to !== op.id);
				return;
			}
			case 'connect': {
				if (!next.nodes.some((node) => node.id === op.from)) return fail(index, op, `There is no step called "${op.from}".`);
				if (!next.nodes.some((node) => node.id === op.to)) return fail(index, op, `There is no step called "${op.to}".`);
				const edge = connection(op.from, op.port ?? 'out', op.to);
				if (next.edges.some((existing) => existing.id === edge.id)) return fail(index, op, `${op.from} already connects to ${op.to} on "${edge.port}".`);
				next.edges.push(edge);
				return;
			}
			case 'disconnect': {
				const before = next.edges.length;
				next.edges = next.edges.filter(
					(edge) => !(edge.from === op.from && edge.to === op.to && (op.port === undefined || edge.port === op.port))
				);
				if (next.edges.length === before) return fail(index, op, `${op.from} does not connect to ${op.to}${op.port ? ` on "${op.port}"` : ''}.`);
				return;
			}
			default:
				return fail(index, op, `"${(op as { op: string }).op}" is not an operation.`);
		}
	});

	if (failures.length) return { flow, applied: false, failures };
	return { flow: next, applied: true, failures: [] };
}

function connection(from: string, port: string, to: string): FlowEdge {
	return { id: edgeId(from, port, to), from, port, to };
}

/** The touching connections a `removeNode` would take with it, for a warning before it happens. */
export function removalCost(flow: Flow, id: string): FlowEdge[] {
	return edgesTouching(flow, id);
}
