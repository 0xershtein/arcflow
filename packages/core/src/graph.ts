import type { Flow, FlowEdge, FlowNode } from './flow.js';

export interface FlowGraph {
	byId: Map<string, FlowNode>;
	incoming: Map<string, FlowEdge[]>;
	outgoing: Map<string, FlowEdge[]>;
	/** Loop step id → every step inside its body, including nested loop bodies. */
	bodies: Map<string, Set<string>>;
	/** Step id → id of the innermost loop whose body contains it, or `''` at the top level. */
	owner: Map<string, string>;
}

/** Indexes connections and works out which steps belong to which loop body. */
export function analyzeFlow(flow: Flow, isLoop: (node: FlowNode) => boolean): FlowGraph {
	const byId = new Map(flow.nodes.map((node) => [node.id, node]));
	const incoming = new Map(flow.nodes.map((node) => [node.id, [] as FlowEdge[]]));
	const outgoing = new Map(flow.nodes.map((node) => [node.id, [] as FlowEdge[]]));
	for (const edge of flow.edges) {
		if (!byId.has(edge.from) || !byId.has(edge.to)) continue;
		outgoing.get(edge.from)!.push(edge);
		incoming.get(edge.to)!.push(edge);
	}

	const bodies = new Map<string, Set<string>>();
	for (const node of flow.nodes) {
		if (!isLoop(node)) continue;
		const body = new Set<string>();
		const stack = outgoing
			.get(node.id)!
			.filter((edge) => edge.port === 'item')
			.map((edge) => edge.to);
		while (stack.length) {
			const id = stack.pop()!;
			if (id === node.id || body.has(id)) continue;
			body.add(id);
			for (const edge of outgoing.get(id)!) stack.push(edge.to);
		}
		bodies.set(node.id, body);
	}

	const owner = new Map<string, string>();
	for (const node of flow.nodes) {
		let innermost = '';
		let size = Infinity;
		for (const [loopId, body] of bodies) {
			if (body.has(node.id) && body.size < size) {
				innermost = loopId;
				size = body.size;
			}
		}
		owner.set(node.id, innermost);
	}

	return { byId, incoming, outgoing, bodies, owner };
}
