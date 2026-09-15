import { isField, type Field, type Shape } from './schema.js';
import type { AnyNodeDefinition } from './node.js';

export type JSONSchema = { [key: string]: unknown };

export interface SchemaOptions {
	/** Allow `{{ expression }}` strings for non-text fields (default `true`). */
	expressions?: boolean;
	title?: string;
}

const EXPRESSION: JSONSchema = {
	type: 'string',
	pattern: '^\\s*\\{\\{.+\\}\\}\\s*$',
	description: 'Expression, e.g. "{{ vars.balance }}" or "{{ steps.check.output.months }}".'
};

const compact = (value: JSONSchema) => Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined));

export function fieldSchema(field: Field, options: SchemaOptions = {}): JSONSchema {
	let schema: JSONSchema;
	switch (field.kind) {
		case 'string':
			schema = { type: 'string', pattern: field.pattern, minLength: field.minLength, maxLength: field.maxLength };
			break;
		case 'number':
			schema = { type: field.integer ? 'integer' : 'number', minimum: field.min, maximum: field.max };
			break;
		case 'boolean':
			schema = { type: 'boolean' };
			break;
		case 'enum':
			schema = { type: 'string', enum: [...field.values] };
			break;
		case 'list':
			schema = {
				type: 'array',
				items: isField(field.item) ? fieldSchema(field.item, options) : shapeSchema(field.item, options),
				minItems: field.minItems,
				maxItems: field.maxItems
			};
			break;
	}
	const typed = options.expressions !== false && field.kind !== 'string' ? { anyOf: [compact(schema), EXPRESSION] } : compact(schema);
	return compact({
		title: field.label,
		description: field.description ?? (field.kind === 'number' && field.unit ? `In ${field.unit}.` : undefined),
		default: field.default,
		...typed
	});
}

export function shapeSchema(shape: Shape, options: SchemaOptions = {}): JSONSchema {
	const entries = Object.entries(shape);
	return {
		type: 'object',
		properties: Object.fromEntries(entries.map(([key, field]) => [key, fieldSchema(field, options)])),
		required: entries.filter(([, field]) => !field.optional && field.default === undefined && !field.when).map(([key]) => key),
		additionalProperties: false
	};
}

/**
 * JSON Schema (2020-12) for a flow built from these step types — use it for structured output,
 * tool parameters, or editor autocompletion.
 */
export function flowSchema(nodes: readonly AnyNodeDefinition[], options: SchemaOptions = {}): JSONSchema {
	const variants = nodes.map((def) => {
		const config = shapeSchema(def.config, options);
		const needsConfig = (config.required as string[]).length > 0;
		const outputs = def.outputs.map((port) => port.id);
		return {
			type: 'object',
			title: def.title,
			description: `${def.description}${def.trigger ? ' Trigger: starts the flow, no incoming edges.' : ''} Outputs: ${outputs.length ? outputs.join(', ') : 'none'}.`,
			properties: {
				id: { type: 'string', pattern: '^[A-Za-z0-9_-]+$', description: 'Unique step id used by edges.' },
				kind: { const: def.kind },
				label: { type: 'string' },
				config,
				position: {
					type: 'object',
					properties: { x: { type: 'number' }, y: { type: 'number' } },
					required: ['x', 'y'],
					additionalProperties: false
				},
				disabled: { type: 'boolean' },
				notes: { type: 'string' }
			},
			required: needsConfig ? ['id', 'kind', 'config'] : ['id', 'kind'],
			additionalProperties: false
		};
	});

	return {
		$schema: 'https://json-schema.org/draft/2020-12/schema',
		title: options.title ?? 'arcflow flow',
		type: 'object',
		properties: {
			version: { const: 1 },
			name: { type: 'string', minLength: 1 },
			description: { type: 'string' },
			vars: { type: 'object', description: 'Initial run variables, readable as {{ vars.name }}.' },
			nodes: { type: 'array', items: { oneOf: variants } },
			edges: {
				type: 'array',
				items: {
					type: 'object',
					properties: {
						from: { type: 'string', description: 'Source step id.' },
						port: { type: 'string', description: 'Output port of the source step. Optional when it has a single output.' },
						to: { type: 'string', description: 'Target step id.' }
					},
					required: ['from', 'to'],
					additionalProperties: false
				}
			}
		},
		required: ['version', 'name', 'nodes', 'edges'],
		additionalProperties: false
	};
}
