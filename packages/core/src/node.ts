import type { InferShape, Shape, ShapeInput } from './schema.js';

/**
 * Services your steps call at run time (payment rails, LLMs, notifications).
 * Extend it with declaration merging so `ctx.services` is typed:
 *
 *   declare module '@arcflow/core' {
 *     interface Services { slack?: { post(channel: string, text: string): Promise<void> } }
 *   }
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface Services {}

export type RunMode = 'live' | 'simulate';

export interface Port<O extends string = string> {
	id: O;
	label?: string;
	description?: string;
}

export interface StepView {
	status: string;
	output?: unknown;
}

export interface NodeContext<C = Record<string, unknown>> {
	/** Config with defaults applied and `{{ expressions }}` resolved. */
	config: C;
	/** Output of the step that led here (or the trigger payload). */
	input: unknown;
	/** Run variables. Mutations are kept in the run state. */
	vars: Record<string, unknown>;
	/** Finished steps by id, e.g. `ctx.steps.runway.output`. */
	steps: Readonly<Record<string, StepView>>;
	services: Services;
	mode: RunMode;
	runId: string;
	nodeId: string;
	/** 1 on the first try, higher on retries. */
	attempt: number;
	signal: AbortSignal;
	/** Set when `engine.resume()` re-runs a waiting step. */
	resumed?: { data: unknown };
	log(message: string, data?: unknown): void;
}

export type StepResult<O extends string = string> =
	| void
	| undefined
	| {
			/** Output port(s) to continue through. Optional when the step has a single output. */
			port?: O | readonly O[];
			/** Data for later steps (`input`, `{{ steps.<id>.output }}`). */
			output?: unknown;
			message?: string;
	  }
	| {
			/** Pause the run here until `engine.resume()` is called for this step. */
			wait: { reason: string; data?: unknown };
			message?: string;
	  };

export interface NodeDefinition<K extends string = string, S extends Shape = Shape, O extends string = string> {
	kind: K;
	title: string;
	description: string;
	category?: string;
	/** Icon name for editors. */
	icon?: string;
	/** Triggers have no incoming edges; runs start at them. */
	trigger?: boolean;
	outputs: readonly Port<O>[];
	config: S;
	/** Require one of these kinds somewhere upstream (e.g. an approval before a transfer). */
	requires?: { upstream: readonly string[]; message: string };
	/** Total attempts (including the first) and delay between them. */
	retry?: { attempts: number; delayMs?: number; factor?: number };
	timeoutMs?: number;
	/** One-line description of a configured step. */
	summary?(config: InferShape<S>): string;
	/** Cross-field validation. Return a message when the config is invalid. */
	check?(config: InferShape<S>): string | null | undefined;
	/** Real execution. */
	run?(ctx: NodeContext<InferShape<S>>): StepResult<O> | Promise<StepResult<O>>;
	/** Side-effect-free execution for test runs. Falls back to `run`. */
	simulate?(ctx: NodeContext<InferShape<S>>): StepResult<O> | Promise<StepResult<O>>;
}

export type AnyNodeDefinition = NodeDefinition<string, Shape, string>;

export type PortsOf<D> = D extends NodeDefinition<string, Shape, infer O> ? O : never;
export type ConfigOf<D> = D extends NodeDefinition<string, infer S, string> ? InferShape<S> : never;
export type ConfigInputOf<D> = D extends NodeDefinition<string, infer S, string> ? ShapeInput<S> : never;

type NodeInit<K extends string, S extends Shape, O extends string> = Omit<NodeDefinition<K, S, O>, 'outputs' | 'config'> & {
	outputs?: readonly Port<O>[];
	config?: S;
};

/**
 * Defines a step type. `config`, `outputs` and `kind` are inferred, so `run(ctx)` gets a typed
 * `ctx.config` and flows built in code only accept real port names.
 */
export function defineNode<const K extends string, const S extends Shape = {}, const O extends string = 'out'>(
	init: NodeInit<K, S, O>
): NodeDefinition<K, S, O> {
	return {
		...init,
		outputs: init.outputs ?? ([{ id: 'out' }] as unknown as readonly Port<O>[]),
		config: init.config ?? ({} as S)
	};
}

export interface Category {
	id: string;
	label: string;
}

export interface Pack<N extends readonly AnyNodeDefinition[] = readonly AnyNodeDefinition[]> {
	id: string;
	label: string;
	description?: string;
	categories?: readonly Category[];
	nodes: N;
	/** Variables used when a flow runs in `simulate` mode. */
	sampleVars?: Record<string, unknown>;
}

/** Groups step types so they can be registered together. */
export function definePack<const N extends readonly AnyNodeDefinition[]>(pack: Pack<N>): Pack<N> {
	return pack;
}
