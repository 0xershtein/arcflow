import { FlowError, formatIssues, hasErrors, type Issue } from './issues.js';
import { FLOW_VERSION, ID_PATTERN, edgeId, type Flow, type FlowEdge, type FlowNode, type Position } from './flow.js';
import { layoutFlow } from './layout.js';
import type { AnyNodeDefinition, ConfigInputOf, PortsOf } from './node.js';
import type { Registry } from './registry.js';

export interface AddOptions {
	/** Defaults to the last part of the kind, made unique (`check`, `check-2`). */
	id?: string;
	label?: string;
	position?: Position;
	disabled?: boolean;
	notes?: string;
}

export interface Connector {
	to<T extends AnyNodeDefinition>(target: NodeRef<T>): NodeRef<T>;
}

export interface NodeRef<D extends AnyNodeDefinition = AnyNodeDefinition> {
	readonly id: string;
	readonly kind: D['kind'];
	/** Connects this step's only output to `target` and returns `target`, so calls chain. */
	to<T extends AnyNodeDefinition>(target: NodeRef<T>): NodeRef<T>;
	/** Picks an output port: `check.on('true').to(pay)`. */
	on(port: PortsOf<D>): Connector;
	/** Merges config values into this step. */
	set(config: Partial<ConfigInputOf<D>>): NodeRef<D>;
}

type AddArgs<N extends AnyNodeDefinition> = {} extends ConfigInputOf<N>
	? [config?: ConfigInputOf<N>, options?: AddOptions]
	: [config: ConfigInputOf<N>, options?: AddOptions];

export interface BuildOptions {
	/** Assign positions to nodes without one (default `true`). */
	layout?: boolean;
}

/**
 * Builds flows in code with type-checked kinds, config and ports.
 *
 *   const flow = registry.flow('Payroll');
 *   const start = flow.add('trigger.schedule', { every: 'month' });
 *   const check = flow.add('logic.condition', { value: '{{ vars.runway }}', operator: '>', than: 6 });
 *   start.to(check);
 *   check.on('true').to(flow.add('action.transfer', { ... }));
 *   const json = flow.build();
 */
export class FlowBuilder<D extends AnyNodeDefinition = AnyNodeDefinition> {
	readonly #registry: Registry<D>;
	readonly #nodes: FlowNode[] = [];
	readonly #edges = new Map<string, FlowEdge>();
	#name: string;
	#description?: string;
	#vars?: Record<string, unknown>;

	constructor(registry: Registry<D>, name: string) {
		this.#registry = registry;
		this.#name = name;
	}

	name(name: string): this {
		this.#name = name;
		return this;
	}

	description(text: string): this {
		this.#description = text;
		return this;
	}

	vars(values: Record<string, unknown>): this {
		this.#vars = { ...this.#vars, ...values };
		return this;
	}

	add<K extends D['kind']>(kind: K, ...args: AddArgs<Extract<D, { kind: K }>>): NodeRef<Extract<D, { kind: K }>> {
		const [config, options = {}] = args as [Record<string, unknown> | undefined, AddOptions | undefined];
		if (!this.#registry.get(kind)) {
			throw new Error(`Unknown step kind "${kind}". Known kinds: ${this.#registry.nodes.map((n) => n.kind).join(', ')}.`);
		}
		const id = options.id ?? this.#uniqueId(kind);
		if (!ID_PATTERN.test(id)) throw new Error(`Invalid step id "${id}": use letters, digits, "-" or "_".`);
		if (this.#nodes.some((node) => node.id === id)) throw new Error(`A step with id "${id}" already exists.`);

		const node: FlowNode = { id, kind, config: { ...config } };
		if (options.label) node.label = options.label;
		if (options.position) node.position = { ...options.position };
		if (options.disabled) node.disabled = true;
		if (options.notes) node.notes = options.notes;
		this.#nodes.push(node);
		return this.#ref(id) as NodeRef<Extract<D, { kind: K }>>;
	}

	/** Returns a reference to a step added earlier. */
	node(id: string): NodeRef<D> | undefined {
		return this.#nodes.some((node) => node.id === id) ? this.#ref(id) : undefined;
	}

	/** Connects two steps. `port` may be omitted when the source has a single output. */
	connect(from: NodeRef | string, to: NodeRef | string, port?: string): this {
		const fromId = typeof from === 'string' ? from : from.id;
		const toId = typeof to === 'string' ? to : to.id;
		for (const id of [fromId, toId]) {
			if (!this.#nodes.some((node) => node.id === id)) throw new Error(`No step with id "${id}".`);
		}
		const ports = this.#portsOf(fromId);
		const chosen = port ?? (ports.length === 1 ? ports[0] : undefined);
		if (!chosen) {
			throw new Error(`Step "${fromId}" has ${ports.length} outputs (${ports.join(', ')}); pass a port.`);
		}
		if (!ports.includes(chosen)) throw new Error(`Step "${fromId}" has no output "${chosen}" (outputs: ${ports.join(', ')}).`);
		const id = edgeId(fromId, chosen, toId);
		this.#edges.set(id, { id, from: fromId, port: chosen, to: toId });
		return this;
	}

	/** The flow as JSON. Does not validate. */
	toJSON(options: BuildOptions = {}): Flow {
		const flow: Flow = {
			version: FLOW_VERSION,
			name: this.#name,
			...(this.#description ? { description: this.#description } : {}),
			...(this.#vars ? { vars: structuredClone(this.#vars) } : {}),
			nodes: structuredClone(this.#nodes),
			edges: [...this.#edges.values()].map((edge) => ({ ...edge }))
		};
		if (options.layout === false) return flow;
		return layoutFlow(flow, {
			portIndex: (nodeId, port) => this.#portsOf(nodeId).indexOf(port)
		});
	}

	validate(): Issue[] {
		return this.#registry.validate(this.toJSON({ layout: false }));
	}

	/** Validates and returns the flow. Throws `FlowError` if there are errors. */
	build(options: BuildOptions = {}): Flow {
		const issues = this.validate();
		if (hasErrors(issues)) {
			throw new FlowError(`Flow "${this.#name}" is invalid:\n${formatIssues(issues.filter((i) => i.level === 'error'))}`, issues);
		}
		return this.toJSON(options);
	}

	#portsOf(nodeId: string): string[] {
		const node = this.#nodes.find((n) => n.id === nodeId);
		return (node && this.#registry.get(node.kind)?.outputs.map((port) => port.id)) ?? [];
	}

	#uniqueId(kind: string) {
		const base = (kind.split('.').pop() || 'step').replace(/[^A-Za-z0-9_-]+/g, '-');
		let id = base;
		for (let n = 2; this.#nodes.some((node) => node.id === id); n++) id = `${base}-${n}`;
		return id;
	}

	#ref(id: string): NodeRef<D> {
		const node = this.#nodes.find((n) => n.id === id)!;
		const ref: NodeRef<D> = {
			id,
			kind: node.kind as D['kind'],
			to: (target) => {
				this.connect(id, target.id);
				return target;
			},
			on: (port) => ({
				to: (target) => {
					this.connect(id, target.id, port);
					return target;
				}
			}),
			set: (config) => {
				node.config = { ...node.config, ...(config as Record<string, unknown>) };
				return ref;
			}
		};
		return ref;
	}
}
