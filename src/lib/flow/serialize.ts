import type { Registry } from './registry';
import type { FlowDocument, FlowEdge, FlowNode } from './types';

export function toDocument(name: string, nodes: FlowNode[], edges: FlowEdge[]): FlowDocument {
	return {
		version: 1,
		name,
		nodes: nodes.map((n) => ({
			id: n.id,
			kind: n.data.kind,
			...(n.data.label ? { label: n.data.label } : {}),
			position: { x: Math.round(n.position.x), y: Math.round(n.position.y) },
			config: n.data.config
		})),
		edges: edges.map((e) => ({
			id: e.id,
			source: e.source,
			sourceHandle: e.sourceHandle ?? 'out',
			target: e.target,
			targetHandle: e.targetHandle ?? 'in'
		}))
	};
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Parses untrusted JSON into editor state. Throws with a readable message on bad input. */
export function fromDocument(input: unknown, registry: Registry): { name: string; nodes: FlowNode[]; edges: FlowEdge[] } {
	if (!isObject(input) || input.version !== 1) throw new Error('Not a flow file (expected version 1).');
	if (!Array.isArray(input.nodes) || !Array.isArray(input.edges)) throw new Error('Flow file is missing nodes or edges.');

	const nodes: FlowNode[] = input.nodes.map((raw, i) => {
		if (!isObject(raw) || typeof raw.id !== 'string' || typeof raw.kind !== 'string') {
			throw new Error(`Node #${i + 1} is malformed.`);
		}
		const def = registry.get(raw.kind);
		if (!def) throw new Error(`Node "${raw.id}" uses unknown step type "${raw.kind}".`);
		const pos = isObject(raw.position) ? raw.position : {};
		return {
			id: raw.id,
			type: 'flow',
			position: { x: Number(pos.x) || 0, y: Number(pos.y) || 0 },
			data: {
				kind: raw.kind,
				...(typeof raw.label === 'string' && raw.label ? { label: raw.label } : {}),
				config: { ...def.defaults, ...(isObject(raw.config) ? raw.config : {}) }
			}
		};
	});

	const ids = new Set(nodes.map((n) => n.id));
	if (ids.size !== nodes.length) throw new Error('Flow file has duplicate node ids.');

	const edges: FlowEdge[] = input.edges.map((raw, i) => {
		if (!isObject(raw) || typeof raw.source !== 'string' || typeof raw.target !== 'string') {
			throw new Error(`Connection #${i + 1} is malformed.`);
		}
		if (!ids.has(raw.source) || !ids.has(raw.target)) throw new Error(`Connection #${i + 1} points to a missing step.`);
		const sourceHandle = typeof raw.sourceHandle === 'string' ? raw.sourceHandle : 'out';
		return {
			id: typeof raw.id === 'string' ? raw.id : `e-${raw.source}-${sourceHandle}-${raw.target}`,
			source: raw.source,
			sourceHandle,
			target: raw.target,
			targetHandle: typeof raw.targetHandle === 'string' ? raw.targetHandle : 'in'
		};
	});

	return { name: typeof input.name === 'string' ? input.name : 'Untitled flow', nodes, edges };
}
