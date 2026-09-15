/**
 * `{{ expression }}` templates in step config.
 *
 * An expression is a dotted path from one of the roots below, optionally with `??` fallbacks:
 *   {{ vars.balance }}   {{ steps.runway.output.months }}   {{ input.items[0].id ?? "none" }}
 *
 * There is no eval: only property lookups and literals, so flows from untrusted sources are safe to resolve.
 */

export interface ExpressionScope {
	vars?: unknown;
	steps?: unknown;
	input?: unknown;
	trigger?: unknown;
	run?: unknown;
}

export const EXPRESSION_ROOTS = ['vars', 'steps', 'input', 'trigger', 'run'] as const;

const TEMPLATE = /\{\{\s*([\s\S]+?)\s*\}\}/g;
const WHOLE = /^\s*\{\{\s*([\s\S]+?)\s*\}\}\s*$/;
const BLOCKED = new Set(['__proto__', 'prototype', 'constructor']);

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

function lookup(path: string, scope: ExpressionScope): unknown {
	const [root, ...rest] = splitPath(path);
	if (!root || !(EXPRESSION_ROOTS as readonly string[]).includes(root)) return undefined;
	let current: unknown = (scope as Record<string, unknown>)[root];
	for (const key of rest) {
		if (BLOCKED.has(key) || current === null || typeof current !== 'object') return undefined;
		if (!Object.prototype.hasOwnProperty.call(current, key)) return undefined;
		current = (current as Record<string, unknown>)[key];
	}
	return current;
}

/** Evaluates the inside of `{{ }}`. */
export function evaluate(expression: string, scope: ExpressionScope): unknown {
	for (const part of expression.split('??').map((p) => p.trim())) {
		const lit = literal(part);
		const value = lit.found ? lit.value : lookup(part, scope);
		if (value !== undefined && value !== null) return value;
	}
	return undefined;
}

const stringify = (value: unknown) =>
	value === undefined || value === null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);

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
		for (const part of expression.split('??')) {
			const [root, id] = splitPath(part.trim());
			if (root === 'steps' && id) ids.add(id);
		}
	}
	return [...ids];
}
