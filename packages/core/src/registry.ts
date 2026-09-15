import { FlowBuilder } from './builder.js';
import { describeNodes, type DescribeOptions } from './describe.js';
import { edgeId, normalizeFlow, type Flow } from './flow.js';
import { hasErrors, type Issue } from './issues.js';
import { flowSchema, type JSONSchema, type SchemaOptions } from './json-schema.js';
import type { AnyNodeDefinition, Category, Pack } from './node.js';
import { humanize, parseShape } from './schema.js';
import { validateFlow } from './validate.js';

type NodesOf<T> = T extends Pack<infer N> ? N[number] : T extends AnyNodeDefinition ? T : never;

export type ParseResult =
	| { ok: true; flow: Flow; issues: Issue[] }
	| { ok: false; flow: Flow | null; issues: Issue[] };

export interface Registry<D extends AnyNodeDefinition = AnyNodeDefinition> {
	readonly nodes: readonly D[];
	readonly categories: readonly Category[];
	/** Variables merged in when a flow runs in `simulate` mode. */
	readonly sampleVars: Readonly<Record<string, unknown>>;
	get<K extends D['kind']>(kind: K): Extract<D, { kind: K }>;
	get(kind: string): D | undefined;
	/**
	 * Parses untrusted flow JSON (object or string): checks structure, fills config defaults,
	 * and validates. Never throws. `flow` is returned whenever the input is an object, even with errors,
	 * so editors can show and fix it.
	 */
	parse(input: unknown): ParseResult;
	/** Validates a flow that is already structurally sound. */
	validate(flow: Flow): Issue[];
	/** Starts a type-checked flow builder. */
	flow(name: string): FlowBuilder<D>;
	/** JSON Schema for flows made of these steps (structured output, tool parameters). */
	toJSONSchema(options?: SchemaOptions): JSONSchema;
	/** Markdown catalog of the steps and the flow format, for LLM prompts. */
	describe(options?: DescribeOptions): string;
}

/** Collects step types from packs and single definitions. Kinds must be unique. */
export function createRegistry<const T extends readonly (Pack | AnyNodeDefinition)[]>(sources: T): Registry<NodesOf<T[number]>> {
	const nodes: AnyNodeDefinition[] = [];
	const categories: Category[] = [];
	const sampleVars: Record<string, unknown> = {};
	const byKind = new Map<string, AnyNodeDefinition>();

	const addCategory = (id: string, label?: string) => {
		if (!categories.some((category) => category.id === id)) categories.push({ id, label: label ?? humanize(id) });
	};

	const addNode = (def: AnyNodeDefinition, origin: string) => {
		if (!/^[A-Za-z0-9_.-]+$/.test(def.kind)) throw new Error(`Invalid step kind "${def.kind}" in ${origin}.`);
		if (byKind.has(def.kind)) throw new Error(`Step kind "${def.kind}" is registered twice (${origin}).`);
		const ports = def.outputs.map((port) => port.id);
		if (new Set(ports).size !== ports.length) throw new Error(`Step kind "${def.kind}" has duplicate output ids.`);
		if (def.loop && !(ports.includes('item') && ports.includes('done'))) {
			throw new Error(`Loop step kind "${def.kind}" needs "item" and "done" outputs.`);
		}
		if (def.loop && def.trigger) throw new Error(`Step kind "${def.kind}" cannot be both a trigger and a loop.`);
		byKind.set(def.kind, def);
		nodes.push(def);
		addCategory(def.category ?? 'other');
	};

	for (const source of sources) {
		if ('kind' in source) {
			addNode(source, `step "${source.kind}"`);
			continue;
		}
		for (const category of source.categories ?? []) addCategory(category.id, category.label);
		for (const def of source.nodes) addNode(def, `pack "${source.id}"`);
		Object.assign(sampleVars, source.sampleVars);
	}

	const registry: Registry<AnyNodeDefinition> = {
		nodes: Object.freeze(nodes),
		categories: Object.freeze(categories),
		sampleVars: Object.freeze(sampleVars),

		get: ((kind: string) => byKind.get(kind)) as Registry<AnyNodeDefinition>['get'],

		parse(input) {
			const normalized = normalizeFlow(input);
			if (!normalized.flow) return { ok: false, flow: null, issues: normalized.issues };

			const kindOf = new Map(normalized.flow.nodes.map((node) => [node.id, node.kind]));
			const flow: Flow = {
				...normalized.flow,
				nodes: normalized.flow.nodes.map((node, index) => {
					const def = byKind.get(node.kind);
					if (!def) return node;
					const parsed = parseShape(def.config, node.config, `nodes[${index}].config`, { allowExpressions: true });
					// Keep raw values that failed to parse so they can be shown and fixed.
					return { ...node, config: { ...node.config, ...parsed.value } };
				}),
				edges: normalized.flow.edges.map((edge) => {
					const outputs = byKind.get(kindOf.get(edge.from) ?? '')?.outputs;
					if (edge.port !== 'out' || outputs?.length !== 1 || outputs[0].id === 'out') return edge;
					const port = outputs[0].id;
					return { ...edge, port, id: edgeId(edge.from, port, edge.to) };
				})
			};

			const issues = [...normalized.issues, ...validateFlow(flow, registry)];
			return hasErrors(issues) ? { ok: false, flow, issues } : { ok: true, flow, issues };
		},

		validate: (flow) => validateFlow(flow, registry),
		flow: (name) => new FlowBuilder(registry, name),
		toJSONSchema: (options) => flowSchema(nodes, options),
		describe: (options) => describeNodes(nodes, categories, options)
	};

	return registry as unknown as Registry<NodesOf<T[number]>>;
}
