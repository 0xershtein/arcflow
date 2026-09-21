import { edgeId, layoutFlow, type Flow, type FlowAnnotation, type FlowNode, type Registry } from '@arcsig-labs/core';
import type { Edge, Node } from '@xyflow/svelte';

export interface StepData extends Record<string, unknown> {
	kind: string;
	label?: string;
	config: Record<string, unknown>;
	disabled?: boolean;
	join?: 'any' | 'all';
	notes?: string;
}

export interface NoteData extends Record<string, unknown> {
	text: string;
	/** Opens the note for typing when it appears. Not saved. */
	editing?: boolean;
}

export type CanvasNode = Node<StepData, 'step'>;
export type CanvasNote = Node<NoteData, 'note'>;
export type CanvasItem = CanvasNode | CanvasNote;
export type CanvasEdge = Edge;

export const NOTE_SIZE = { width: 220, height: 140 };

export const isStep = (node: CanvasItem): node is CanvasNode => node.type === 'step';
export const isNote = (node: CanvasItem): node is CanvasNote => node.type === 'note';

export const canvasEdge = (source: string, port: string, target: string): CanvasEdge => ({
	id: edgeId(source, port, target),
	type: 'flow',
	source,
	sourceHandle: port,
	target,
	targetHandle: 'in'
});

/** Flow JSON → Svelte Flow nodes and edges. Steps without a position are laid out automatically. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toCanvas(flow: Flow, registry: Registry<any>): { nodes: CanvasItem[]; edges: CanvasEdge[] } {
	const kinds = new Map(flow.nodes.map((node) => [node.id, node.kind]));
	const placed = layoutFlow(flow, {
		portIndex: (nodeId, port) => {
			const outputs: { id: string }[] = registry.get(kinds.get(nodeId) ?? '')?.outputs ?? [];
			return Math.max(0, outputs.findIndex((output) => output.id === port));
		}
	});

	// Notes come first so steps render above them.
	const notes = (flow.annotations ?? []).map(
		(note): CanvasNote => ({
			id: note.id,
			type: 'note',
			position: { ...note.position },
			width: note.width ?? NOTE_SIZE.width,
			height: note.height ?? NOTE_SIZE.height,
			data: { text: note.text }
		})
	);

	const steps = placed.nodes.map(
		(node): CanvasNode => ({
			id: node.id,
			type: 'step',
			position: node.position ?? { x: 0, y: 0 },
			data: {
				kind: node.kind,
				config: node.config,
				...(node.label ? { label: node.label } : {}),
				...(node.disabled ? { disabled: true } : {}),
				...(node.join ? { join: node.join } : {}),
				...(node.notes ? { notes: node.notes } : {})
			}
		})
	);

	return {
		nodes: [...notes, ...steps],
		edges: flow.edges.map((edge) => canvasEdge(edge.from, edge.port, edge.to))
	};
}

/** Svelte Flow nodes and edges → flow JSON. */
/** One canvas step as it appears in the flow JSON. */
export function toFlowNode(node: CanvasNode): FlowNode {
	return {
		id: node.id,
		kind: node.data.kind,
		...(node.data.label ? { label: node.data.label } : {}),
		config: node.data.config,
		position: { x: Math.round(node.position.x), y: Math.round(node.position.y) },
		...(node.data.disabled ? { disabled: true } : {}),
		...(node.data.join ? { join: node.data.join } : {}),
		...(node.data.notes ? { notes: node.data.notes } : {})
	};
}

export function fromCanvas(meta: Pick<Flow, 'name' | 'description' | 'vars'>, nodes: CanvasItem[], edges: CanvasEdge[]): Flow {
	const annotations = nodes.filter(isNote).map(
		(note): FlowAnnotation => ({
			id: note.id,
			text: note.data.text,
			position: { x: Math.round(note.position.x), y: Math.round(note.position.y) },
			width: Math.round(note.width ?? NOTE_SIZE.width),
			height: Math.round(note.height ?? NOTE_SIZE.height)
		})
	);
	return {
		version: 1,
		name: meta.name,
		...(meta.description ? { description: meta.description } : {}),
		...(meta.vars ? { vars: meta.vars } : {}),
		nodes: nodes.filter(isStep).map(toFlowNode),
		edges: edges.map((edge) => {
			const port = edge.sourceHandle ?? 'out';
			return { id: edgeId(edge.source, port, edge.target), from: edge.source, port, to: edge.target };
		}),
		...(annotations.length ? { annotations } : {})
	};
}
