/**
 * `{{ expression }}` templates in step config.
 *
 *   {{ vars.balance }}
 *   {{ steps.fetch.output.items | map: "price" | sum | round: 2 }}
 *   {{ $item.email ?? "unknown" | lower }}
 *
 * An expression is a path from one of the roots below (or a literal), optional `??` fallbacks, and
 * optional `| filter: args`. There is no eval: only property lookups and the filters listed in
 * `FILTERS`, so flows from untrusted sources are safe to resolve.
 */

export interface ExpressionScope {
	vars?: unknown;
	steps?: unknown;
	input?: unknown;
	inputs?: unknown;
	trigger?: unknown;
	run?: unknown;
	$item?: unknown;
	$index?: unknown;
	$now?: unknown;
}

export const EXPRESSION_ROOTS = ['vars', 'steps', 'input', 'inputs', 'trigger', 'run', '$item', '$index', '$now'] as const;

export class ExpressionError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ExpressionError';
	}
}

const TEMPLATE = /\{\{\s*([\s\S]+?)\s*\}\}/g;
const WHOLE = /^\s*\{\{\s*([\s\S]+?)\s*\}\}\s*$/;
const BLOCKED = new Set(['__proto__', 'prototype', 'constructor']);

/** Splits on a separator that is not inside quotes. `||` is not treated as a filter separator. */
function splitTopLevel(source: string, separator: string): string[] {
	const parts: string[] = [];
	let quote: string | null = null;
	let start = 0;
	for (let i = 0; i < source.length; i++) {
		const char = source[i];
		if (quote) {
			if (char === quote) quote = null;
			continue;
		}
		if (char === '"' || char === "'") {
			quote = char;
			continue;
		}
		if (!source.startsWith(separator, i)) continue;
		if (separator === '|' && source[i + 1] === '|') {
			i++;
			continue;
		}
		parts.push(source.slice(start, i));
		start = i + separator.length;
		i += separator.length - 1;
	}
	parts.push(source.slice(start));
	return parts.map((part) => part.trim());
}

function literal(token: string): { found: boolean; value?: unknown } {
	if (/^-?\d+(\.\d+)?$/.test(token)) return { found: true, value: Number(token) };
	if (token === 'true' || token === 'false') return { found: true, value: token === 'true' };
	if (token === 'null') return { found: true, value: null };
	const quoted = /^(['"])([\s\S]*)\1$/.exec(token);
	return quoted ? { found: true, value: quoted[2] } : { found: false };
}

export function splitPath(path: string): string[] {
	return [...path.matchAll(/[^.[\]\s]+|\[(\d+)\]/g)].map((match) => match[1] ?? match[0]);
}

function readPath(target: unknown, segments: string[]): unknown {
	let current = target;
	for (const key of segments) {
		if (BLOCKED.has(key) || current === null || typeof current !== 'object') return undefined;
		if (!Object.prototype.hasOwnProperty.call(current, key)) return undefined;
		current = (current as Record<string, unknown>)[key];
	}
	return current;
}

function lookup(path: string, scope: ExpressionScope): unknown {
	const [root, ...rest] = splitPath(path);
	if (!root || !(EXPRESSION_ROOTS as readonly string[]).includes(root)) return undefined;
	return readPath((scope as Record<string, unknown>)[root], rest);
}

const stringify = (value: unknown) =>
	value === undefined || value === null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);

const toNumber = (value: unknown) => {
	const number = typeof value === 'number' ? value : Number(value);
	return Number.isFinite(number) ? number : 0;
};

const numbers = (value: unknown, key?: unknown) =>
	Array.isArray(value) ? value.map((item) => toNumber(key === undefined ? item : readPath(item, splitPath(String(key))))) : [toNumber(value)];

/** Filters available after `|`. */
export const FILTERS: Record<string, (value: unknown, ...args: unknown[]) => unknown> = {
	length: (value) =>
		typeof value === 'string' || Array.isArray(value) ? value.length : value && typeof value === 'object' ? Object.keys(value).length : 0,
	sum: (value, key) => numbers(value, key).reduce((total, n) => total + n, 0),
	min: (value, key) => Math.min(...numbers(value, key)),
	max: (value, key) => Math.max(...numbers(value, key)),
	avg: (value, key) => {
		const list = numbers(value, key);
		return list.length ? list.reduce((total, n) => total + n, 0) / list.length : 0;
	},
	map: (value, key) => (Array.isArray(value) ? value.map((item) => readPath(item, splitPath(String(key)))) : []),
	first: (value) => (Array.isArray(value) ? value[0] : undefined),
	last: (value) => (Array.isArray(value) ? value[value.length - 1] : undefined),
	join: (value, separator = ', ') => (Array.isArray(value) ? value.map(stringify).join(String(separator)) : stringify(value)),
	keys: (value) => (value && typeof value === 'object' ? Object.keys(value) : []),
	json: (value) => JSON.stringify(value ?? null),
	default: (value, fallback) => (value === undefined || value === null || value === '' ? fallback : value),
	upper: (value) => stringify(value).toUpperCase(),
	lower: (value) => stringify(value).toLowerCase(),
	trim: (value) => stringify(value).trim(),
	round: (value, digits = 0) => {
		const factor = 10 ** toNumber(digits);
		return Math.round(toNumber(value) * factor) / factor;
	},
	number: (value) => toNumber(value),
	string: (value) => stringify(value)
};

function parseFilter(filter: string): { name: string; args: string[] } {
	const parts = splitTopLevel(filter, ':');
	const [name, ...rest] = parts;
	return { name: name ?? '', args: rest.length ? splitTopLevel(rest.join(':'), ',') : [] };
}

/** Evaluates the inside of `{{ }}`. Throws `ExpressionError` for unknown filters. */
export function evaluate(expression: string, scope: ExpressionScope): unknown {
	const [head, ...filters] = splitTopLevel(expression, '|');
	let value: unknown;
	for (const part of splitTopLevel(head, '??')) {
		const lit = literal(part);
		const candidate = lit.found ? lit.value : lookup(part, scope);
		if (candidate !== undefined && candidate !== null) {
			value = candidate;
			break;
		}
	}
	for (const filter of filters) {
		const { name, args } = parseFilter(filter);
		const apply = FILTERS[name];
		if (!apply) throw new ExpressionError(`Unknown filter "${name}".`);
		value = apply(
			value,
			...args.map((arg) => {
				const lit = literal(arg);
				return lit.found ? lit.value : lookup(arg, scope);
			})
		);
	}
	return value;
}

/** Plain-language name of each expression root, for messages about missing data. */
const ROOT_NAMES: Record<string, string> = {
	vars: 'the run variables',
	steps: 'the earlier steps',
	input: 'the step input',
	inputs: 'the step inputs',
	trigger: 'the trigger payload',
	run: 'the run'
};

/** `['body', '0', 'total']` → `body[0].total` */
function joinSegments(segments: string[]): string {
	return segments.reduce((path, segment) => {
		if (/^\d+$/.test(segment)) return `${path}[${segment}]`;
		return path ? `${path}.${segment}` : segment;
	}, '');
}

/**
 * Why an expression produced nothing, in plain language — e.g. `the trigger payload had no body.total`.
 * Returns `null` when the expression does resolve to a value, so callers can tell a run-time miss
 * ("nothing arrived") from a configuration mistake ("nothing was written here").
 */
export function describeMissing(expression: string, scope: ExpressionScope): string | null {
	const [head] = splitTopLevel(expression, '|');
	const parts = splitTopLevel(head, '??');
	let path: string | undefined;
	for (const part of parts) {
		if (!part) continue;
		const lit = literal(part);
		if (lit.found) {
			if (lit.value !== undefined && lit.value !== null) return null;
			continue;
		}
		if (lookup(part, scope) !== undefined) return null;
		path ??= part;
	}
	if (path === undefined) return null;

	const [root, ...rest] = splitPath(path);
	if (!root || !(EXPRESSION_ROOTS as readonly string[]).includes(root)) return null;
	const name = ROOT_NAMES[root] ?? root;
	let current = (scope as Record<string, unknown>)[root];
	if (current === undefined || current === null || rest.length === 0) return `there was nothing in ${name}`;

	for (const [index, segment] of rest.entries()) {
		current = readPath(current, [segment]);
		if (current === undefined || current === null) return `${name} had no ${joinSegments(rest.slice(0, index + 1))}`;
	}
	return `${name} had no ${joinSegments(rest)}`;
}

/** Returns a problem description, or `null` when the expression is well formed. */
export function checkExpression(expression: string): string | null {
	const [head, ...filters] = splitTopLevel(expression, '|');
	for (const part of splitTopLevel(head, '??')) {
		if (!part) return 'Empty expression.';
		if (literal(part).found) continue;
		const root = splitPath(part)[0];
		if (!root || !(EXPRESSION_ROOTS as readonly string[]).includes(root)) {
			return `"${part}" must start with one of ${EXPRESSION_ROOTS.join(', ')}.`;
		}
	}
	for (const filter of filters) {
		const { name } = parseFilter(filter);
		if (!FILTERS[name]) return `Unknown filter "${name}".`;
	}
	return null;
}

/**
 * Resolves templates deeply. A string that is exactly one expression keeps the value's type
 * (`"{{ vars.limit }}"` → `5000`); mixed strings are interpolated.
 */
export function resolveTemplates<T>(value: T, scope: ExpressionScope): T {
	if (typeof value === 'string') {
		const whole = WHOLE.exec(value);
		if (whole && !whole[1].includes('}}') && !whole[1].includes('{{')) return evaluate(whole[1], scope) as T;
		return value.replace(TEMPLATE, (_, expression: string) => stringify(evaluate(expression, scope))) as T;
	}
	if (Array.isArray(value)) return value.map((item) => resolveTemplates(item, scope)) as T;
	if (value && typeof value === 'object') {
		return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolveTemplates(item, scope)])) as T;
	}
	return value;
}

/** Every expression found in a value, e.g. `["steps.runway.output.months"]`. */
export function collectExpressions(value: unknown, found: string[] = []): string[] {
	if (typeof value === 'string') {
		for (const match of value.matchAll(TEMPLATE)) found.push(match[1].trim());
	} else if (Array.isArray(value)) {
		value.forEach((item) => collectExpressions(item, found));
	} else if (value && typeof value === 'object') {
		Object.values(value).forEach((item) => collectExpressions(item, found));
	}
	return found;
}

/** Step ids referenced through `steps.<id>` in a value. */
export function referencedSteps(value: unknown): string[] {
	const ids = new Set<string>();
	for (const expression of collectExpressions(value)) {
		const [head, ...filters] = splitTopLevel(expression, '|');
		const paths = [...splitTopLevel(head, '??'), ...filters.flatMap((filter) => parseFilter(filter).args)];
		for (const path of paths) {
			const [root, id] = splitPath(path);
			if (root === 'steps' && id) ids.add(id);
		}
	}
	return [...ids];
}
