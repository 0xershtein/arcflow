/**
 * Writes a value as a JavaScript literal the way the docs' snippets are written: single quotes,
 * bare keys where they are identifiers, tabs for indentation. `Code` values are pasted as-is, for
 * names like `flow` or `labelsDe` that stand for something defined elsewhere in the snippet.
 */
export class Code {
	constructor(readonly text: string) {}
}

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

export function literal(value: unknown, depth = 0): string {
	if (value instanceof Code) return value.text;
	if (typeof value === 'string') return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
	if (typeof value === 'number' || typeof value === 'boolean' || value === null) return String(value);
	if (Array.isArray(value)) return `[${value.map((item) => literal(item, depth)).join(', ')}]`;
	if (typeof value === 'object') {
		const entries = Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined);
		if (entries.length === 0) return '{}';
		const inner = entries.map(([key, v]) => `${IDENTIFIER.test(key) ? key : literal(key)}: ${literal(v, depth + 1)}`);
		const flat = `{ ${inner.join(', ')} }`;
		// Short objects stay on one line, as they would be written by hand.
		if (flat.length <= 72 && !flat.includes('\n')) return flat;
		const pad = '\t'.repeat(depth + 1);
		return `{\n${inner.map((line) => pad + line).join(',\n')}\n${'\t'.repeat(depth)}}`;
	}
	return String(value);
}
