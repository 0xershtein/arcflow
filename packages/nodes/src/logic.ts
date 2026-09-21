import { defineNode, f } from '@arcsig-labs/core';
import { DURATION_MS, compare, hasExpression, isEmpty, isRecord, looseEquals, sleep } from './util.js';

export const OPERATORS = [
	'equals',
	'not_equals',
	'gt',
	'gte',
	'lt',
	'lte',
	'contains',
	'not_contains',
	'starts_with',
	'ends_with',
	'matches',
	'is_empty',
	'is_not_empty',
	'is_true',
	'is_false'
] as const;

export type Operator = (typeof OPERATORS)[number];

const OPERATOR_LABELS: Record<Operator, string> = {
	equals: 'equals',
	not_equals: 'does not equal',
	gt: 'is greater than',
	gte: 'is at least',
	lt: 'is less than',
	lte: 'is at most',
	contains: 'contains',
	not_contains: 'does not contain',
	starts_with: 'starts with',
	ends_with: 'ends with',
	matches: 'matches pattern',
	is_empty: 'is empty',
	is_not_empty: 'is not empty',
	is_true: 'is true',
	is_false: 'is false'
};

function contains(haystack: unknown, needle: unknown) {
	if (typeof haystack === 'string') return haystack.includes(String(needle));
	if (Array.isArray(haystack)) return haystack.some((item) => looseEquals(item, needle));
	if (isRecord(haystack)) return Object.prototype.hasOwnProperty.call(haystack, String(needle));
	return false;
}

/** Evaluates one condition. Exported for reuse in custom steps. */
export function evaluateCondition(left: unknown, operator: Operator, right: unknown): boolean {
	switch (operator) {
		case 'equals':
			return looseEquals(left, right);
		case 'not_equals':
			return !looseEquals(left, right);
		case 'gt':
			return compare(left, right) > 0;
		case 'gte':
			return compare(left, right) >= 0;
		case 'lt':
			return compare(left, right) < 0;
		case 'lte':
			return compare(left, right) <= 0;
		case 'contains':
			return contains(left, right);
		case 'not_contains':
			return !contains(left, right);
		case 'starts_with':
			return String(left ?? '').startsWith(String(right ?? ''));
		case 'ends_with':
			return String(left ?? '').endsWith(String(right ?? ''));
		case 'matches': {
			const pattern = String(right ?? '');
			if (pattern.length > 200) throw new Error('Patterns are limited to 200 characters.');
			return new RegExp(pattern).test(String(left ?? ''));
		}
		case 'is_empty':
			return isEmpty(left);
		case 'is_not_empty':
			return !isEmpty(left);
		case 'is_true':
			return left === true || left === 'true';
		case 'is_false':
			return left === false || left === 'false';
	}
}

const UNARY: readonly Operator[] = ['is_empty', 'is_not_empty', 'is_true', 'is_false'];

export const ifStep = defineNode({
	kind: 'logic.if',
	title: 'If',
	description: 'Checks conditions and continues through "true" or "false". Passes its input along unchanged.',
	category: 'flow',
	icon: 'split',
	outputs: [
		{ id: 'true', label: 'True' },
		{ id: 'false', label: 'False' }
	],
	config: {
		conditions: f.list(
			{
				left: f.json({ label: 'Value', placeholder: '{{ input.total }}' }),
				operator: f.enum(OPERATORS, { default: 'equals', labels: OPERATOR_LABELS }),
				right: f.json({ optional: true, label: 'Compare to' })
			},
			{ minItems: 1 }
		),
		combine: f.enum(['all', 'any'], { default: 'all', labels: { all: 'All conditions match', any: 'Any condition matches' } })
	},
	summary: (c) => {
		if (!Array.isArray(c.conditions)) return 'If';
		const joiner = c.combine === 'any' ? ' or ' : ' and ';
		return c.conditions
			.map(({ left, operator, right }) =>
				[String(left).replace(/^\{\{\s*|\s*\}\}$/g, ''), OPERATOR_LABELS[operator] ?? operator, UNARY.includes(operator) ? '' : JSON.stringify(right)]
					.filter(Boolean)
					.join(' ')
			)
			.join(joiner);
	},
	run: (ctx) => {
		const results = ctx.config.conditions.map(({ left, operator, right }) => evaluateCondition(left, operator, right));
		const pass = ctx.config.combine === 'any' ? results.some(Boolean) : results.every(Boolean);
		return { port: pass ? 'true' : 'false', output: ctx.input, message: pass ? 'Conditions matched' : 'Conditions did not match' };
	}
});

export const switchStep = defineNode({
	kind: 'logic.switch',
	title: 'Switch',
	description: 'Sends the input to the first case whose value equals the checked value, or to "otherwise".',
	category: 'flow',
	icon: 'switch',
	outputs: [
		{ id: 'case1', label: 'Case 1' },
		{ id: 'case2', label: 'Case 2' },
		{ id: 'case3', label: 'Case 3' },
		{ id: 'case4', label: 'Case 4' },
		{ id: 'otherwise', label: 'Otherwise' }
	],
	config: {
		value: f.json({ label: 'Check', placeholder: '{{ input.status }}' }),
		cases: f.list({ equals: f.json({ label: 'Equals' }) }, { minItems: 1, maxItems: 4, description: 'Case 1 to 4, in order.' })
	},
	summary: (c) => (Array.isArray(c.cases) ? `${c.cases.length} ${c.cases.length === 1 ? 'case' : 'cases'}` : 'Switch'),
	run: (ctx) => {
		const index = ctx.config.cases.findIndex((option) => looseEquals(ctx.config.value, option.equals));
		const port = index === -1 ? 'otherwise' : (`case${index + 1}` as 'case1' | 'case2' | 'case3' | 'case4');
		return { port, output: ctx.input, message: index === -1 ? 'No case matched' : `Case ${index + 1}` };
	}
});

export const mergeStep = defineNode({
	kind: 'logic.merge',
	title: 'Merge',
	description: 'Waits for every incoming branch to finish or be skipped, then combines what arrived.',
	category: 'flow',
	icon: 'merge',
	join: 'all',
	config: {
		mode: f.enum(['object', 'list', 'first'], {
			default: 'object',
			labels: { object: 'Combine objects into one', list: 'List of all inputs', first: 'First input only' }
		})
	},
	summary: (c) => ({ object: 'Combine objects', list: 'List of inputs', first: 'First input' })[c.mode],
	run: (ctx) => {
		const values = Object.keys(ctx.inputs).length > 1 ? (ctx.input as unknown[]) : [ctx.input];
		switch (ctx.config.mode) {
			case 'list':
				return { output: values };
			case 'first':
				return { output: values[0] };
			default:
				return { output: Object.assign({}, ...values.filter(isRecord)) };
		}
	}
});

export const loopStep = defineNode({
	kind: 'logic.loop',
	title: 'Loop',
	description:
		'Runs the steps connected to "each item" once per item ({{ $item }}, {{ $index }}), then continues from "done" with the list of results.',
	category: 'flow',
	icon: 'repeat',
	loop: true,
	outputs: [
		{ id: 'item', label: 'Each item' },
		{ id: 'done', label: 'Done' }
	],
	config: {
		items: f.json({ placeholder: '{{ steps.fetch.output.body }}', description: 'A list to loop over.' }),
		concurrency: f.number({ integer: true, min: 1, max: 50, default: 1, label: 'Items at a time' })
	},
	summary: (c) => (c.concurrency > 1 ? `${c.concurrency} items at a time` : 'One item at a time'),
	run: (ctx) => {
		const { items, concurrency } = ctx.config;
		if (!Array.isArray(items)) throw new Error(`Items must be a list, but got ${items === null ? 'null' : typeof items}.`);
		return { loop: { items, concurrency }, message: `${items.length} items` };
	}
});

/** Waits shorter than this happen inside the step instead of pausing the run. */
export const INLINE_WAIT_MS = 10_000;

export const waitStep = defineNode({
	kind: 'logic.wait',
	title: 'Wait',
	description: 'Pauses for a duration or until a date. Short waits happen in place; longer ones pause the run until a scheduler resumes it.',
	category: 'flow',
	icon: 'hourglass',
	config: {
		mode: f.enum(['duration', 'until'], { default: 'duration', labels: { duration: 'For a duration', until: 'Until a date' } }),
		amount: f.number({ min: 0, default: 1, when: { field: 'mode', equals: ['duration'] } }),
		unit: f.enum(['seconds', 'minutes', 'hours', 'days'], { default: 'minutes', when: { field: 'mode', equals: ['duration'] } }),
		until: f.string({ placeholder: '2026-10-01T09:00:00Z', mono: true, description: 'ISO date and time.', when: { field: 'mode', equals: ['until'] } })
	},
	check: (c) => (c.mode === 'until' && !hasExpression(c.until) && !Number.isFinite(Date.parse(c.until ?? '')) ? `"${c.until}" is not a valid date.` : null),
	summary: (c) => (c.mode === 'until' ? `Until ${c.until}` : `${c.amount} ${c.unit}`),
	run: async (ctx) => {
		if (ctx.resumed) return { output: ctx.input };
		const { mode, amount, unit, until } = ctx.config;
		const target = mode === 'until' ? Date.parse(until ?? '') : Date.now() + amount * DURATION_MS[unit];
		if (!Number.isFinite(target)) throw new Error(`"${until}" is not a valid date.`);
		const ms = target - Date.now();
		if (ms <= 0) return { output: ctx.input };
		if (ms <= INLINE_WAIT_MS) {
			await sleep(ms, ctx.signal);
			return { output: ctx.input, message: `Waited ${Math.round(ms)} ms` };
		}
		const at = new Date(target).toISOString();
		return { wait: { reason: 'timer', data: { until: at } }, message: `Waiting until ${at}` };
	},
	simulate: (ctx) => ({
		output: ctx.input,
		message: ctx.config.mode === 'until' ? `Skipped waiting until ${ctx.config.until}` : `Skipped a ${ctx.config.amount} ${ctx.config.unit} wait`
	})
});
