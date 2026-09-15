import { describe, expect, it } from 'vitest';
import { FlowError, createRegistry, defineNode } from '../src/index.js';
import { paymentFlow, registry } from './fixtures.js';

const codes = (issues: { code: string; path: string }[]) => issues.map((i) => `${i.code}@${i.path}`);

describe('builder', () => {
	it('builds a valid flow with generated layout', () => {
		const flow = paymentFlow().build();
		expect(flow.nodes.map((n) => n.id)).toEqual(['start', 'check', 'sign', 'send', 'done', 'low']);
		expect(flow.edges).toContainEqual({ id: 'check:true->sign', from: 'check', port: 'true', to: 'sign' });
		expect(flow.nodes.every((n) => n.position)).toBe(true);

		const y = (id: string) => flow.nodes.find((n) => n.id === id)!.position!.y;
		const x = (id: string) => flow.nodes.find((n) => n.id === id)!.position!.x;
		expect(x('check')).toBeGreaterThan(x('start'));
		expect(y('sign')).toBeLessThan(y('low')); // "true" branch above "false"
	});

	it('refuses ambiguous connections and duplicate ids', () => {
		const flow = registry.flow('Bad');
		const check = flow.add('test.if', { value: 1 });
		const note = flow.add('test.note', { text: 'x' });
		expect(() => check.to(note)).toThrow(/several outputs|2 outputs/);
		expect(() => flow.add('test.note', { text: 'y' }, { id: note.id })).toThrow(/already exists/);
		// @ts-expect-error unknown port is a type error
		expect(() => check.on('maybe').to(note)).toThrow(/no output "maybe"/);
	});

	it('throws FlowError with issues from build()', () => {
		const flow = registry.flow('No approval');
		flow.add('test.start').to(flow.add('test.pay', { amount: 1 }));
		try {
			flow.build();
			expect.unreachable();
		} catch (error) {
			expect(error).toBeInstanceOf(FlowError);
			expect(codes((error as FlowError).issues)).toContain('missing_upstream@nodes[1]');
		}
	});
});

describe('parse & validate', () => {
	it('accepts JSON strings and React Flow style edges, filling defaults', () => {
		const result = registry.parse(
			JSON.stringify({
				version: 1,
				name: 'From JSON',
				nodes: [
					{ id: 'a', kind: 'test.start' },
					{ id: 'b', kind: 'test.approve', config: { signers: ['x'] } }
				],
				edges: [{ source: 'a', target: 'b' }]
			})
		);
		expect(result.ok).toBe(true);
		expect(result.flow?.nodes[1].config).toEqual({ signers: ['x'], threshold: 1 });
		expect(result.flow?.edges[0]).toMatchObject({ from: 'a', port: 'out', to: 'b' });
	});

	it('reports structural and semantic problems with codes and paths', () => {
		const result = registry.parse({
			version: 1,
			name: 'Broken',
			nodes: [
				{ id: 'a', kind: 'test.start' },
				{ id: 'b', kind: 'test.if', config: { value: 'lots' } },
				{ id: 'c', kind: 'test.nope' },
				{ id: 'd', kind: 'test.approve', config: { signers: ['x'], threshold: 3 } },
				{ id: 'e', kind: 'test.note', config: { text: '{{ steps.ghost.output }}' } },
				{ id: 'f', kind: 'test.note', config: { text: 'loop' } },
				{ id: 'g', kind: 'test.note', config: { text: 'loop' } }
			],
			edges: [
				{ from: 'a', to: 'b' },
				{ from: 'b', port: 'maybe', to: 'd' },
				{ from: 'b', port: 'true', to: 'zzz' },
				{ from: 'd', port: 'approved', to: 'e' },
				{ from: 'f', to: 'g' },
				{ from: 'g', to: 'f' }
			]
		});
		expect(result.ok).toBe(false);
		expect(codes(result.issues)).toEqual(
			expect.arrayContaining([
				'invalid_type@nodes[1].config.value',
				'unknown_kind@nodes[2].kind',
				'check_failed@nodes[3].config',
				'unknown_port@edges[1].port',
				'unknown_node@edges[2].to',
				'unknown_reference@nodes[4].config',
				'cycle@nodes[5]'
			])
		);
		const cycle = result.issues.find((i) => i.code === 'cycle');
		expect(cycle?.level).toBe('error');
	});

	it('requires a trigger and flags triggers with inputs', () => {
		const withoutTrigger = registry.parse({ version: 1, name: 'x', nodes: [{ id: 'n', kind: 'test.note', config: { text: 'hi' } }], edges: [] });
		expect(codes(withoutTrigger.issues)).toContain('no_trigger@nodes');

		const intoTrigger = registry.parse({
			version: 1,
			name: 'x',
			nodes: [
				{ id: 'n', kind: 'test.note', config: { text: 'hi' } },
				{ id: 's', kind: 'test.start' }
			],
			edges: [{ from: 'n', to: 's' }]
		});
		expect(codes(intoTrigger.issues)).toContain('trigger_input@edges[0].to');
		expect(codes(intoTrigger.issues)).not.toContain('no_trigger@nodes');
	});

	it('uses the only output when "port" is omitted', () => {
		const one = defineNode({ kind: 'x.start', title: 'S', description: 'S', trigger: true, outputs: [{ id: 'next' }] });
		const two = defineNode({ kind: 'x.end', title: 'E', description: 'E' });
		const reg = createRegistry([one, two]);
		const result = reg.parse({ version: 1, name: 'n', nodes: [{ id: 'a', kind: 'x.start' }, { id: 'b', kind: 'x.end' }], edges: [{ from: 'a', to: 'b' }] });
		expect(result.ok).toBe(true);
		expect(result.flow?.edges[0].port).toBe('next');
	});
});

describe('annotations', () => {
	it('keeps sticky notes and rejects ids that clash with nodes', () => {
		const flow = {
			version: 1,
			name: 'Notes',
			nodes: [{ id: 'start', kind: 'test.start' }],
			edges: [],
			annotations: [
				{ id: 'why', text: 'Runs every Monday', position: { x: 10, y: -80 }, width: 240 },
				{ id: 'start', text: 'clash' }
			]
		};
		const result = registry.parse(flow);
		expect(result.flow?.annotations).toEqual([{ id: 'why', text: 'Runs every Monday', position: { x: 10, y: -80 }, width: 240 }]);
		expect(codes(result.issues)).toContain('duplicate_id@annotations[1].id');
	});
});

describe('LLM helpers', () => {
	it('produces a JSON Schema with one variant per step kind', () => {
		const schema = registry.toJSONSchema() as {
			properties: { nodes: { items: { oneOf: { properties: { kind: { const: string }; config: { required: string[] } } }[] } } };
		};
		const variants = schema.properties.nodes.items.oneOf;
		expect(variants.map((v) => v.properties.kind.const)).toEqual(['test.start', 'test.if', 'test.approve', 'test.pay', 'test.flaky', 'test.note']);
		expect(variants[2].properties.config.required).toEqual(['signers']);
	});

	it('describes steps for prompts', () => {
		const text = registry.describe();
		expect(text).toContain('# Flow format');
		expect(text).toContain('### `test.approve` — Approve');
		expect(text).toContain('- Outputs: `approved`, `rejected`');
		expect(text).toContain('`threshold`: integer ≥ 1, default 1');
		expect(text).toContain('Must come after: `test.approve`');
	});
});
