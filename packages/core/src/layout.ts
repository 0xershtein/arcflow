import type { Flow, Position } from './flow.js';

export interface LayoutOptions {
	/** Horizontal distance between columns. */
	columnGap?: number;
	/** Vertical distance between rows. */
	rowGap?: number;
	/** Re-position every node, not only the ones without a position. */
	force?: boolean;
	/** Order of an output port on its node, so `true` lands above `false`. */
	portIndex?: (nodeId: string, port: string) => number;
}

/**
 * Left-to-right layered layout: each step sits one column after its furthest parent, and rows are
 * ordered by where the parents are. Good enough for flows written by code or an LLM.
 * Returns a new flow; nodes that already have a position keep it unless `force` is set.
 */
export function layoutFlow(flow: Flow, options: LayoutOptions = {}): Flow {
	const { columnGap = 300, rowGap = 170, force = false, portIndex } = options;
	const targets = force ? flow.nodes : flow.nodes.filter((node) => !node.position);
	if (targets.length === 0) return flow;

	const ids = new Set(targets.map((node) => node.id));
	const docIndex = new Map(flow.nodes.map((node, index) => [node.id, index]));
	const incoming = new Map(targets.map((node) => [node.id, [] as Flow['edges']]));
	const outgoing = new Map(targets.map((node) => [node.id, [] as Flow['edges']]));
	for (const edge of flow.edges) {
		if (!ids.has(edge.from) || !ids.has(edge.to)) continue;
		incoming.get(edge.to)!.push(edge);
		outgoing.get(edge.from)!.push(edge);
	}

	// Topological order via DFS; edges back into a node still on the stack (loops) are ignored.
	const state = new Map<string, 'open' | 'done'>();
	const order: string[] = [];
	const visit = (id: string) => {
		if (state.has(id)) return;
		state.set(id, 'open');
		for (const edge of outgoing.get(id)!) if (state.get(edge.to) !== 'open') visit(edge.to);
		state.set(id, 'done');
		order.push(id);
	};
	const roots = targets.filter((node) => incoming.get(node.id)!.length === 0);
	[...roots, ...targets].forEach((node) => visit(node.id));
	order.reverse();

	const rank = new Map(order.map((id, index) => [id, index]));
	const column = new Map<string, number>();
	for (const id of order) {
		let value = 0;
		for (const edge of incoming.get(id)!) {
			if (rank.get(edge.from)! < rank.get(id)!) value = Math.max(value, column.get(edge.from)! + 1);
		}
		column.set(id, value);
	}

	const columns: string[][] = [];
	for (const id of order) (columns[column.get(id)!] ??= []).push(id);

	const y = new Map<string, number>();
	columns.forEach((ids, index) => {
		if (index === 0) {
			ids.sort((a, b) => docIndex.get(a)! - docIndex.get(b)!);
		} else {
			const score = (id: string) => {
				const parents = incoming.get(id)!.filter((edge) => y.has(edge.from));
				if (!parents.length) return Number.MAX_SAFE_INTEGER;
				const total = parents.reduce((sum, edge) => sum + y.get(edge.from)! + (portIndex?.(edge.from, edge.port) ?? 0) * rowGap * 0.5, 0);
				return total / parents.length;
			};
			ids.sort((a, b) => score(a) - score(b) || docIndex.get(a)! - docIndex.get(b)!);
		}
		ids.forEach((id, row) => y.set(id, (row - (ids.length - 1) / 2) * rowGap));
	});

	let offset: Position = { x: 0, y: 0 };
	const placed = flow.nodes.filter((node) => node.position && !ids.has(node.id));
	if (placed.length) {
		const minX = Math.min(...placed.map((node) => node.position!.x));
		const maxY = Math.max(...placed.map((node) => node.position!.y));
		const minComputedY = Math.min(...y.values());
		offset = { x: minX, y: maxY + rowGap * 1.5 - minComputedY };
	}

	return {
		...flow,
		nodes: flow.nodes.map((node) =>
			ids.has(node.id)
				? { ...node, position: { x: Math.round(column.get(node.id)! * columnGap + offset.x), y: Math.round(y.get(node.id)! + offset.y) } }
				: node
		)
	};
}
