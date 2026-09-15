import type { Edge, Node, XYPosition } from '@xyflow/svelte';
import type { IconName } from './icons';

export type FieldType = 'text' | 'textarea' | 'number' | 'select' | 'toggle';

export interface FieldOption {
	value: string;
	label: string;
}

export interface FieldDef {
	key: string;
	label: string;
	type: FieldType;
	placeholder?: string;
	help?: string;
	required?: boolean;
	options?: FieldOption[];
	min?: number;
	max?: number;
	step?: number;
	suffix?: string;
	/** Render the value in the monospace face (addresses, amounts). */
	mono?: boolean;
	/** Only show this field when another field has one of these values. */
	showIf?: { key: string; equals: unknown[] };
}

export interface PortDef {
	id: string;
	label?: string;
}

export type NodeConfig = Record<string, unknown>;

export interface FlowNodeData extends Record<string, unknown> {
	kind: string;
	/** Optional user-given name; falls back to the definition title. */
	label?: string;
	config: NodeConfig;
}

export type FlowNode = Node<FlowNodeData, 'flow'>;
export type FlowEdge = Edge;

export interface RunContext {
	/** Shared variables for one run. Nodes read and write these. */
	vars: Record<string, unknown>;
}

export interface RunResult {
	/** Output port id(s) to continue through. Omit or pass [] to end this branch. */
	next?: string | string[];
	message?: string;
	status?: 'success' | 'error';
}

export interface NodeDefinition {
	kind: string;
	title: string;
	description: string;
	category: string;
	icon: IconName;
	/** Triggers have no input port and start a run. */
	trigger?: boolean;
	/** Output ports. Defaults to a single unlabeled `out` port. */
	outputs?: PortDef[];
	fields?: FieldDef[];
	defaults?: NodeConfig;
	/** One-line description of the configured node, shown on the canvas. */
	summary?: (config: NodeConfig) => string;
	/** Extra config validation; return a message to flag the node. */
	check?: (config: NodeConfig) => string | null;
	/** Require one of these node kinds somewhere upstream (e.g. an approval before a transfer). */
	requiresUpstream?: { kinds: string[]; message: string };
	/** Simulated execution used by Test run. Without it the node passes through `out`. */
	run?: (config: NodeConfig, ctx: RunContext) => RunResult | Promise<RunResult>;
}

export interface CategoryDef {
	id: string;
	label: string;
}

export interface NodePack {
	id: string;
	label: string;
	categories: CategoryDef[];
	nodes: NodeDefinition[];
	/** Starting variables for Test run. */
	sampleVars?: Record<string, unknown>;
}

export interface FlowDocument {
	version: 1;
	name: string;
	nodes: { id: string; kind: string; label?: string; position: XYPosition; config: NodeConfig }[];
	edges: { id: string; source: string; sourceHandle: string; target: string; targetHandle: string }[];
}
