import type { Issue } from './issues.js';

export const FLOW_VERSION = 1;

export interface Position {
	x: number;
	y: number;
}

export interface FlowNode {
	id: string;
	kind: string;
	label?: string;
	config: Record<string, unknown>;
	/** Optional. Editors lay out nodes without one. */
	position?: Position;
	/** Disabled steps pass their input through their first output. */
	disabled?: boolean;
	notes?: string;
}

export interface FlowEdge {
	id: string;
	from: string;
	port: string;
	to: string;
}

export interface Flow {
	version: typeof FLOW_VERSION;
	name: string;
	description?: string;
	/** Initial run variables, readable as `{{ vars.name }}`. */
	vars?: Record<string, unknown>;
	nodes: FlowNode[];
	edges: FlowEdge[];
}

export const ID_PATTERN = /^[A-Za-z0-9_-]+$/;

export const edgeId = (from: string, port: string, to: string) => `${from}:${port}->${to}`;

const isObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Checks the shape of untrusted flow JSON (ids, references are left to `validateFlow`).
 * Accepts `source`/`target`/`sourceHandle` edges from React/Svelte Flow as well.
 * Never throws; returns `flow: null` only when the input is not an object.
 */
export function normalizeFlow(input: unknown): { flow: Flow | null; issues: Issue[] } {
	const issues: Issue[] = [];
	const push = (level: Issue['level'], code: Issue['code'], path: string, message: string, extra: Partial<Issue> = {}) => {
		issues.push({ level, code, path, message, ...extra });
	};

	if (typeof input === 'string') {
		try {
			input = JSON.parse(input);
		} catch {
			push('error', 'invalid_document', '', 'Flow is not valid JSON.');
			return { flow: null, issues };
		}
	}
	if (!isObject(input)) {
		push('error', 'invalid_document', '', 'A flow must be a JSON object.');
		return { flow: null, issues };
	}

	if (input.version !== undefined && input.version !== FLOW_VERSION) {
		push('error', 'invalid_document', 'version', `Unsupported version ${JSON.stringify(input.version)}; expected ${FLOW_VERSION}.`);
	}

	let name = 'Untitled flow';
	if (typeof input.name === 'string' && input.name.trim()) name = input.name.trim();
	else push('warning', 'required', 'name', 'Flow has no name.');

	if (!Array.isArray(input.nodes)) push('error', 'invalid_document', 'nodes', '"nodes" must be an array.');
	if (input.edges !== undefined && !Array.isArray(input.edges)) push('error', 'invalid_document', 'edges', '"edges" must be an array.');

	const nodes: FlowNode[] = [];
	const ids = new Set<string>();
	(Array.isArray(input.nodes) ? input.nodes : []).forEach((raw: unknown, index) => {
		const path = `nodes[${index}]`;
		if (!isObject(raw)) return push('error', 'invalid_type', path, 'Each node must be an object.');
		const { id, kind } = raw;
		if (typeof id !== 'string' || !ID_PATTERN.test(id)) {
			return push('error', 'invalid_type', `${path}.id`, 'Node id must use only letters, digits, "-" or "_".');
		}
		if (ids.has(id)) return push('error', 'duplicate_id', `${path}.id`, `Node id "${id}" is used more than once.`, { nodeId: id });
		ids.add(id);
		if (typeof kind !== 'string' || !kind) {
			return push('error', 'invalid_type', `${path}.kind`, 'Node kind must be a non-empty string.', { nodeId: id });
		}
		if (raw.config !== undefined && !isObject(raw.config)) {
			push('error', 'invalid_type', `${path}.config`, 'Node config must be an object.', { nodeId: id });
		}

		const node: FlowNode = { id, kind, config: isObject(raw.config) ? { ...raw.config } : {} };
		if (typeof raw.label === 'string' && raw.label.trim()) node.label = raw.label;
		const position = raw.position;
		if (isObject(position) && Number.isFinite(position.x) && Number.isFinite(position.y)) {
			node.position = { x: Number(position.x), y: Number(position.y) };
		}
		if (raw.disabled === true) node.disabled = true;
		if (typeof raw.notes === 'string' && raw.notes) node.notes = raw.notes;
		nodes.push(node);
	});

	const edges: FlowEdge[] = [];
	const edgeIds = new Set<string>();
	(Array.isArray(input.edges) ? input.edges : []).forEach((raw: unknown, index) => {
		const path = `edges[${index}]`;
		if (!isObject(raw)) return push('error', 'invalid_type', path, 'Each edge must be an object.');
		const from = raw.from ?? raw.source;
		const to = raw.to ?? raw.target;
		const port = raw.port ?? raw.sourceHandle ?? 'out';
		if (typeof from !== 'string') return push('error', 'invalid_type', `${path}.from`, 'Edge "from" must be a node id.');
		if (typeof to !== 'string') return push('error', 'invalid_type', `${path}.to`, 'Edge "to" must be a node id.');
		if (typeof port !== 'string' || !port) return push('error', 'invalid_type', `${path}.port`, 'Edge "port" must be a string.');
		const id = edgeId(from, port, to);
		if (edgeIds.has(id)) return push('warning', 'duplicate_id', path, `Duplicate connection ${from} → ${to} was dropped.`, { edgeId: id });
		edgeIds.add(id);
		edges.push({ id, from, port, to });
	});

	const flow: Flow = { version: FLOW_VERSION, name, nodes, edges };
	if (typeof input.description === 'string' && input.description) flow.description = input.description;
	if (isObject(input.vars)) flow.vars = { ...input.vars };
	return { flow, issues };
}
