import type { Registry } from './registry';
import type { FieldDef, FlowEdge, FlowNode, NodeConfig } from './types';

export interface Issue {
	level: 'error' | 'warning';
	message: string;
	nodeId?: string;
}

const isEmpty = (value: unknown) =>
	value === undefined || value === null || (typeof value === 'string' && value.trim() === '');

export function isFieldVisible(field: FieldDef, config: NodeConfig) {
	return !field.showIf || field.showIf.equals.includes(config[field.showIf.key]);
}

function findCycleNode(nodes: FlowNode[], edges: FlowEdge[]): string | null {
	const out = new Map<string, string[]>();
	for (const e of edges) out.set(e.source, [...(out.get(e.source) ?? []), e.target]);
	const state = new Map<string, 'visiting' | 'done'>();

	const visit = (id: string): string | null => {
		if (state.get(id) === 'visiting') return id;
		if (state.get(id) === 'done') return null;
		state.set(id, 'visiting');
		for (const next of out.get(id) ?? []) {
			const hit = visit(next);
			if (hit) return hit;
		}
		state.set(id, 'done');
		return null;
	};

	for (const n of nodes) {
		const hit = visit(n.id);
		if (hit) return hit;
	}
	return null;
}

function upstreamKinds(nodeId: string, nodes: FlowNode[], edges: FlowEdge[]) {
	const byId = new Map(nodes.map((n) => [n.id, n]));
	const kinds = new Set<string>();
	const seen = new Set<string>();
	const stack = [nodeId];
	while (stack.length) {
		const id = stack.pop()!;
		for (const e of edges) {
			if (e.target !== id || seen.has(e.source)) continue;
			seen.add(e.source);
			const source = byId.get(e.source);
			if (source) kinds.add(source.data.kind);
			stack.push(e.source);
		}
	}
	return kinds;
}

export function validateFlow(nodes: FlowNode[], edges: FlowEdge[], registry: Registry): Issue[] {
	const issues: Issue[] = [];

	if (!nodes.some((n) => registry.get(n.data.kind)?.trigger)) {
		issues.push({ level: 'error', message: 'Add a trigger so the flow knows when to start.' });
	}

	for (const node of nodes) {
		const def = registry.get(node.data.kind);
		if (!def) {
			issues.push({ level: 'error', nodeId: node.id, message: `Unknown step type "${node.data.kind}".` });
			continue;
		}
		const name = node.data.label || def.title;

		for (const field of def.fields ?? []) {
			if (field.required && isFieldVisible(field, node.data.config) && isEmpty(node.data.config[field.key])) {
				issues.push({ level: 'error', nodeId: node.id, message: `${name}: ${field.label} is required.` });
			}
		}

		const custom = def.check?.(node.data.config);
		if (custom) issues.push({ level: 'error', nodeId: node.id, message: `${name}: ${custom}` });

		if (!def.trigger && !edges.some((e) => e.target === node.id)) {
			issues.push({ level: 'warning', nodeId: node.id, message: `${name} is not connected to anything before it.` });
		}

		if (def.requiresUpstream) {
			const kinds = upstreamKinds(node.id, nodes, edges);
			if (!def.requiresUpstream.kinds.some((k) => kinds.has(k))) {
				issues.push({ level: 'error', nodeId: node.id, message: `${name}: ${def.requiresUpstream.message}` });
			}
		}
	}

	const cycleAt = findCycleNode(nodes, edges);
	if (cycleAt) issues.push({ level: 'error', nodeId: cycleAt, message: 'The flow loops back on itself.' });

	return issues;
}
