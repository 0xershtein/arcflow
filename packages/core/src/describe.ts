import { isField, type Field } from './schema.js';
import type { AnyNodeDefinition, Category } from './node.js';

export interface DescribeOptions {
	/** Include the flow JSON format and expression rules (default `true`). */
	format?: boolean;
}

export const FORMAT_GUIDE = `# Flow format

A flow is JSON: { "version": 1, "name": "…", "nodes": [ … ], "edges": [ … ] }

- Node: { "id": "check-runway", "kind": "<step kind>", "config": { … } }. Ids use letters, digits, "-" or "_". "position" is optional — editors lay nodes out automatically.
- Edge: { "from": "<node id>", "port": "<output of the source step>", "to": "<node id>" }. "port" may be omitted when the source step has one output.
- A flow starts at a trigger step. Triggers have no incoming edges; every other step needs at least one.
- Steps with several outputs (for example "true" / "false") need "port" on each outgoing edge.
- Config values can use expressions: {{ vars.name }}, {{ steps.<node id>.output.<field> }}, {{ input.<field> }} (output of the previous step), {{ trigger.<field> }}. "a ?? b" falls back to b. A value that is only an expression keeps its type, so "{{ vars.limit }}" can fill a number field.
`;

function typeText(field: Field): string {
	switch (field.kind) {
		case 'string':
			return field.multiline ? 'text (multi-line)' : field.pattern ? `text matching /${field.pattern}/` : 'text';
		case 'number': {
			const range =
				field.min !== undefined && field.max !== undefined
					? ` ${field.min}–${field.max}`
					: field.min !== undefined
						? ` ≥ ${field.min}`
						: field.max !== undefined
							? ` ≤ ${field.max}`
							: '';
			return `${field.integer ? 'integer' : 'number'}${range}${field.unit ? ` (${field.unit})` : ''}`;
		}
		case 'boolean':
			return 'true | false';
		case 'enum':
			return field.values.map((value) => `"${value}"`).join(' | ');
		case 'list': {
			const item = isField(field.item)
				? typeText(field.item)
				: `{ ${Object.entries(field.item)
						.map(([key, sub]) => `${key}${sub.optional ? '?' : ''}: ${typeText(sub)}`)
						.join(', ')} }`;
			return `list of ${item}${field.minItems ? ` (at least ${field.minItems})` : ''}`;
		}
	}
}

export function describeField(key: string, field: Field) {
	const optional = field.optional && field.default === undefined ? ' (optional)' : '';
	const fallback = field.default !== undefined ? `, default ${JSON.stringify(field.default)}` : '';
	const note = field.description ?? field.label;
	const when = field.when ? ` Only used when ${field.when.field} is ${field.when.equals.map((v) => JSON.stringify(v)).join(' or ')}.` : '';
	return `\`${key}\`${optional}: ${typeText(field)}${fallback}${note ? ` — ${note}` : ''}${when}`;
}

/** A compact Markdown catalog of step types, written to be pasted into an LLM prompt. */
export function describeNodes(nodes: readonly AnyNodeDefinition[], categories: readonly Category[], options: DescribeOptions = {}) {
	const lines: string[] = [];
	if (options.format !== false) lines.push(FORMAT_GUIDE);
	lines.push('# Step types', '');

	for (const category of categories) {
		const defs = nodes.filter((def) => (def.category ?? 'other') === category.id);
		if (!defs.length) continue;
		lines.push(`## ${category.label}`, '');
		for (const def of defs) {
			lines.push(`### \`${def.kind}\` — ${def.title}${def.trigger ? ' (trigger)' : ''}`, def.description);
			const outputs = def.outputs.map((port) => `\`${port.id}\`${port.description ? ` (${port.description})` : ''}`);
			lines.push(`- Outputs: ${outputs.length ? outputs.join(', ') : 'none'}`);
			if (def.requires) lines.push(`- Must come after: ${def.requires.upstream.map((kind) => `\`${kind}\``).join(' or ')}`);
			const fields = Object.entries(def.config);
			if (fields.length) {
				lines.push('- Config:');
				for (const [key, field] of fields) lines.push(`  - ${describeField(key, field)}`);
			} else {
				lines.push('- Config: none');
			}
			lines.push('');
		}
	}
	return lines.join('\n').trimEnd() + '\n';
}
