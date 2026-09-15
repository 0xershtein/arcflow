import { describe, expect, expectTypeOf, it } from 'vitest';
import { f, parseShape, resolveTemplates, referencedSteps, type InferShape, type ShapeInput } from '../src/index.js';

const shape = {
	every: f.enum(['day', 'month'], { default: 'month' }),
	day: f.number({ integer: true, min: 1, max: 28, when: { field: 'every', equals: ['month'] } }),
	signers: f.list(f.string(), { minItems: 1 }),
	recipients: f.list({ to: f.string(), amount: f.number({ min: 0 }) }, { optional: true }),
	memo: f.text({ optional: true }),
	urgent: f.boolean({ default: false })
};

describe('schema', () => {
	it('infers config and input types', () => {
		type Config = InferShape<typeof shape>;
		expectTypeOf<Config['every']>().toEqualTypeOf<'day' | 'month'>();
		expectTypeOf<Config['memo']>().toEqualTypeOf<string | undefined>();
		expectTypeOf<Config['recipients']>().toEqualTypeOf<{ to: string; amount: number }[] | undefined>();

		type Input = ShapeInput<typeof shape>;
		expectTypeOf<Input>().toHaveProperty('signers');
		// fields with defaults are optional when building
		expectTypeOf<{ signers: string[]; day: 3 }>().toMatchTypeOf<Input>();
	});

	it('applies defaults and coerces simple values', () => {
		const { value, issues } = parseShape(shape, { day: '12', signers: ['a'] });
		expect(issues).toEqual([]);
		expect(value).toEqual({ every: 'month', day: 12, signers: ['a'], urgent: false });
	});

	it('reports issues with paths', () => {
		const { issues } = parseShape(shape, { every: 'year', signers: [], recipients: [{ to: 'x', amount: -1 }], extra: 1 }, 'nodes[0].config');
		expect(issues.map((i) => [i.code, i.path])).toEqual([
			['invalid_enum', 'nodes[0].config.every'],
			['too_small', 'nodes[0].config.signers'],
			['too_small', 'nodes[0].config.recipients[0].amount'],
			['unknown_key', 'nodes[0].config.extra']
		]);
	});

	it('skips hidden required fields', () => {
		const { issues } = parseShape(shape, { every: 'day', signers: ['a'] });
		expect(issues).toEqual([]);
	});

	it('accepts expressions only when asked', () => {
		const input = { day: '{{ vars.day }}', signers: ['a'] };
		expect(parseShape(shape, input, '', { allowExpressions: true }).issues).toEqual([]);
		expect(parseShape(shape, input).issues[0]?.code).toBe('invalid_type');
	});
});

describe('expressions', () => {
	const scope = { vars: { limit: 5000, name: 'Ops' }, steps: { runway: { output: { months: 11.2 } } }, input: { items: [{ id: 'a' }] } };

	it('keeps the type of a whole expression and interpolates mixed strings', () => {
		expect(resolveTemplates('{{ vars.limit }}', scope)).toBe(5000);
		expect(resolveTemplates('Runway {{ steps.runway.output.months }} months for {{vars.name}}', scope)).toBe('Runway 11.2 months for Ops');
		expect(resolveTemplates({ list: ['{{ input.items[0].id }}'] }, scope)).toEqual({ list: ['a'] });
	});

	it('supports fallbacks and blocks prototype access', () => {
		expect(resolveTemplates('{{ vars.missing ?? "none" }}', scope)).toBe('none');
		expect(resolveTemplates('{{ vars.constructor }}', scope)).toBeUndefined();
		expect(resolveTemplates('{{ process.env.SECRET }}', scope)).toBeUndefined();
	});

	it('finds referenced steps', () => {
		expect(referencedSteps({ a: '{{ steps.runway.output.months }}', b: ['{{ steps.pay.output ?? steps.x }}'] })).toEqual(['runway', 'pay', 'x']);
	});
});
