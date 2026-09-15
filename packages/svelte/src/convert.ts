import { edgeId, layoutFlow, type Flow, type FlowNode, type Registry } from '@arcflow/core';
import type { Edge, Node } from '@xyflow/svelte';

export interface StepData extends Record<string, unknown> {
	kind: string;
	label?: string;
	config: Record<string, unknown>;
	disabled?: boolean;
	notes?: string;
}

export type CanvasNode = Node<StepData, 'step'>;
export type CanvasEdge = Edge;

/** Flow JSON → Svelte Flow nodes and edges. Steps without a position are laid out automatically. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toCanvas(flow: Flow, registry: Registry<any>): { nodes: CanvasNode[]; edges: CanvasEdge[] } {
	const kinds = new Map(flow.nodes.map((node) => [node.id, node.kind]));
	const placed = layoutFlow(flow, {
		portIndex: (nodeId, port) => {
			const outputs: { id: string }[] = registry.get(kinds.get(nodeId) ?? '')?.outputs ?? [];
			return Math.max(0, outputs.findIndex((output) => output.id === port));
		}
	});

	return {
		nodes: placed.nodes.map((node) => ({
			id: node.id,
			type: 'step',
			position: node.position ?? { x: 0, y: 0 },
			data: {
				kind: node.kind,
				config: node.config,
				...(node.label ? { label: node.label } : {}),
				...(node.disabled ? { disabled: true } : {}),
				...(node.notes ? { notes: node.notes } : {})
			}
		})),
		edges: flow.edges.map((edge) => ({
			id: edge.id,
			source: edge.from,
			sourceHandle: edge.port,
			target: edge.to,
			targetHandle: 'in'
		}))
	};
}

/** Svelte Flow nodes and edges → flow JSON. */
export function fromCanvas(meta: Pick<Flow, 'name' | 'description' | 'vars'>, nodes: CanvasNode[], edges: CanvasEdge[]): Flow {
	return {
		version: 1,
		name: meta.name,
		...(meta.description ? { description: meta.description } : {}),
		...(meta.vars ? { vars: meta.vars } : {}),
		nodes: nodes.map(
			(node): FlowNode => ({
				id: node.id,
				kind: node.data.kind,
				...(node.data.label ? { label: node.data.label } : {}),
				config: node.data.config,
				position: { x: Math.round(node.position.x), y: Math.round(node.position.y) },
				...(node.data.disabled ? { disabled: true } : {}),
				...(node.data.notes ? { notes: node.data.notes } : {})
			})
		),
		edges: edges.map((edge) => {
			const port = edge.sourceHandle ?? 'out';
			return { id: edgeId(edge.source, port, edge.target), from: edge.source, port, to: edge.target };
		})
	};
}
