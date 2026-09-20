import { createRegistry, type Registry } from './registry.js';
import type { AnyNodeDefinition, Category, NodeDefinition, Port } from './node.js';
import { isField, type Field, type Shape } from './schema.js';

/**
 * A step catalog as plain JSON: everything an editor needs to show, configure and validate flows,
 * minus the code. Servers send it to browsers; `registryFromManifest` turns it back into a registry.
 */
export interface StepManifest {
	kind: string;
	title: string;
	description: string;
	category?: string;
	icon?: string;
	trigger?: boolean;
	loop?: boolean;
	join?: 'any' | 'all';
	subflow?: { field: string };
	outputs: Port[];
	config: Shape;
	requires?: { upstream: string[]; message: string };
	retry?: { attempts: number; delayMs?: number; factor?: number };
	timeoutMs?: number;
}

export interface RegistryManifest {
	version: 1;
	categories: Category[];
	/** Variables merged in when a flow runs in `simulate` mode. */
	sampleVars: Record<string, unknown>;
	steps: StepManifest[];
}

export const MANIFEST_VERSION = 1;

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** The registry as JSON. `summary`, `check`, `run` and `simulate` are code and stay behind. */
export function toManifest(registry: Registry<AnyNodeDefinition>): RegistryManifest {
	return {
		version: MANIFEST_VERSION,
		categories: clone([...registry.categories]),
		sampleVars: clone({ ...registry.sampleVars }),
		steps: (registry.nodes as readonly AnyNodeDefinition[]).map((def) => ({
			kind: def.kind,
			title: def.title,
			description: def.description,
			...(def.category ? { category: def.category } : {}),
			...(def.icon ? { icon: def.icon } : {}),
			...(def.trigger ? { trigger: true } : {}),
			...(def.loop ? { loop: true } : {}),
			...(def.join ? { join: def.join } : {}),
			...(def.subflow ? { subflow: clone(def.subflow) } : {}),
			outputs: clone([...def.outputs]),
			config: clone(def.config),
			...(def.requires ? { requires: clone({ upstream: [...def.requires.upstream], message: def.requires.message }) } : {}),
			...(def.retry ? { retry: clone(def.retry) } : {}),
			...(def.timeoutMs !== undefined ? { timeoutMs: def.timeoutMs } : {})
		}))
	};
}

const FIELD_KINDS = new Set(['string', 'number', 'boolean', 'enum', 'list', 'json', 'credential']);
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** Keeps a field that came over the wire, falling back to a free-form JSON field. */
function readField(input: unknown): Field {
	const json = { kind: 'json' } as unknown as Field;
	if (!isObject(input) || typeof input.kind !== 'string' || !FIELD_KINDS.has(input.kind)) return json;
	if (input.kind === 'enum' && !(Array.isArray(input.values) && input.values.every((value) => typeof value === 'string'))) return json;
	if (input.kind === 'credential' && typeof input.type !== 'string') return json;
	if (input.kind === 'list') {
		const item = input.item;
		return { ...input, item: isObject(item) && isField(item as Field | Shape) ? readField(item) : readShape(item) } as unknown as Field;
	}
	return input as unknown as Field;
}

function readShape(input: unknown): Shape {
	if (!isObject(input)) return {};
	return Object.fromEntries(Object.entries(input).map(([key, field]) => [key, readField(field)]));
}

/** Registries built by `registryFromManifest`, so hosts can tell steps with code from steps without. */
const manifestRegistries = new WeakSet<object>();

/**
 * Whether a registry came from `registryFromManifest`. Its steps carry no code, so flows made of
 * them can be shown, edited and validated here but have to run on the server that sent the manifest.
 */
export function isManifestRegistry(registry: unknown): boolean {
	return typeof registry === 'object' && registry !== null && manifestRegistries.has(registry);
}

const title = (step: Record<string, unknown>, kind: string) => (typeof step.title === 'string' && step.title ? step.title : kind);

/**
 * Rebuilds a registry from a manifest, for editors and tools that only display, edit and validate flows.
 * The steps have no code: running one throws, because it belongs on the server that sent the manifest.
 */
export function registryFromManifest(input: unknown): Registry<AnyNodeDefinition> {
	if (!isObject(input) || !Array.isArray(input.steps)) throw new Error('Not a step manifest: "steps" is missing.');
	if (input.version !== MANIFEST_VERSION) throw new Error(`Unsupported manifest version ${JSON.stringify(input.version)}; expected ${MANIFEST_VERSION}.`);

	const nodes = input.steps.filter(isObject).map((step): AnyNodeDefinition => {
		const kind = String(step.kind ?? '');
		const outputs = Array.isArray(step.outputs) ? step.outputs.filter(isObject).map((port) => ({ ...port, id: String(port.id) }) as Port) : [];
		const definition: NodeDefinition = {
			kind,
			title: typeof step.title === 'string' && step.title ? step.title : kind,
			description: typeof step.description === 'string' ? step.description : '',
			...(typeof step.category === 'string' ? { category: step.category } : {}),
			...(typeof step.icon === 'string' ? { icon: step.icon } : {}),
			...(step.trigger === true ? { trigger: true } : {}),
			...(step.loop === true ? { loop: true } : {}),
			...(step.join === 'all' || step.join === 'any' ? { join: step.join } : {}),
			...(isObject(step.subflow) && typeof step.subflow.field === 'string' ? { subflow: { field: step.subflow.field } } : {}),
			outputs: outputs.length ? outputs : [{ id: 'out' }],
			config: readShape(step.config),
			...(isObject(step.requires) && Array.isArray(step.requires.upstream)
				? { requires: { upstream: step.requires.upstream.map(String), message: String(step.requires.message ?? '') } }
				: {}),
			...(isObject(step.retry) ? { retry: step.retry as NodeDefinition['retry'] } : {}),
			...(typeof step.timeoutMs === 'number' ? { timeoutMs: step.timeoutMs } : {}),
			run() {
				throw new Error(`"${title(step, kind)}" runs on the flow server, not here.`);
			}
		};
		return definition;
	});

	const pack = {
		id: 'manifest',
		label: 'Steps',
		categories: (Array.isArray(input.categories) ? input.categories : [])
			.filter(isObject)
			.map((category) => ({ id: String(category.id), label: String(category.label ?? category.id) })),
		nodes,
		...(isObject(input.sampleVars) ? { sampleVars: input.sampleVars } : {})
	};
	const registry = createRegistry([pack]) as Registry<AnyNodeDefinition>;
	manifestRegistries.add(registry);
	return registry;
}
