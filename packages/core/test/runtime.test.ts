import { describe, expect, it, vi } from 'vitest';
import { checkExpression, createEngine, createRegistry, defineNode, f, resolveTemplates, waitingSteps } from '../src/index.js';

const start = defineNode({ kind: 'rt.start', title: 'Start', description: 'Starts the flow.', trigger: true, run: (ctx) => ({ output: ctx.input }) });

const note = defineNode({
	kind: 'rt.note',
	title: 'Note',
	description: 'Outputs its text.',
	config: { text: f.text() },
	run: (ctx) => ({ output: { text: ctx.config.text } })
});

const branch = defineNode({
	kind: 'rt.if',
	title: 'If',
	description: 'Branches on a boolean.',
	outputs: [{ id: 'true' }, { id: 'false' }],
	config: { value: f.boolean() },
	run: (ctx) => ({ port: ctx.config.value ? 'true' : 'false', output: ctx.input })
});

const merge = defineNode({
	kind: 'rt.merge',
	title: 'Merge',
	description: 'Waits for every branch.',
	join: 'all',
	run: (ctx) => ({ output: { input: ctx.input, from: Object.keys(ctx.inputs).sort() } })
});

const each = defineNode({
	kind: 'rt.each',
	title: 'Each',
	description: 'Runs its body per item.',
	loop: true,
	outputs: [{ id: 'item' }, { id: 'done' }],
	config: { items: f.json() },
	run: (ctx) => ({ loop: { items: Array.isArray(ctx.config.items) ? ctx.config.items : [] } })
});

const approve = defineNode({
	kind: 'rt.approve',
	title: 'Approve',
	description: 'Waits for a person.',
	outputs: [{ id: 'yes' }, { id: 'no' }],
	run: (ctx) =>
		ctx.resumed
			? { port: (ctx.resumed.data as { ok: boolean }).ok ? 'yes' : 'no', output: { item: ctx.item } }
			: { wait: { reason: 'approval', data: { index: ctx.index } } }
});

const secret = defineNode({
	kind: 'rt.secret',
	title: 'Secret',
	description: 'Uses a credential.',
	config: { token: f.credential('api-token') },
	run: (ctx) => ({ output: { length: String(ctx.secrets.token).length } })
});

const registry = createRegistry([start, note, branch, merge, each, approve, secret]);

describe('joins', () => {
	it('waits for every branch with join "all"', async () => {
		const flow = registry.flow('Join');
		const s = flow.add('rt.start', {}, { id: 's' });
		const m = flow.add('rt.merge', {}, { id: 'm' });
		s.to(flow.add('rt.note', { text: 'A' }, { id: 'a' })).to(m);
		s.to(flow.add('rt.note', { text: 'B' }, { id: 'b' })).to(m);

		const run = await createEngine(registry).start(flow.build());
		expect(run.status).toBe('completed');
		expect(run.steps.m).toMatchObject({ attempts: 1, output: { input: [{ text: 'A' }, { text: 'B' }], from: ['a', 'b'] } });
	});

	it('runs a join once the other branch is skipped', async () => {
		const flow = registry.flow('Join with a dead branch');
		const s = flow.add('rt.start', {}, { id: 's' });
		const check = flow.add('rt.if', { value: true }, { id: 'check' });
		const m = flow.add('rt.merge', {}, { id: 'm' });
		s.to(check);
		check.on('true').to(flow.add('rt.note', { text: 'yes' }, { id: 'yes' })).to(m);
		check.on('false').to(flow.add('rt.note', { text: 'no' }, { id: 'no' })).to(m);

		const run = await createEngine(registry).start(flow.build());
		expect(run.status).toBe('completed');
		expect(run.steps.no.status).toBe('skipped');
		expect(run.steps.m.output).toEqual({ input: { text: 'yes' }, from: ['yes'] });
	});

	it('runs "any" steps once, on the first arrival', async () => {
		const flow = registry.flow('Any');
		const s = flow.add('rt.start', {}, { id: 's' });
		const n = flow.add('rt.note', { text: 'got {{ input.text }}' }, { id: 'n' });
		s.to(flow.add('rt.note', { text: 'A' }, { id: 'a' })).to(n);
		s.to(flow.add('rt.note', { text: 'B' }, { id: 'b' })).to(n);

		const run = await createEngine(registry).start(flow.build());
		expect(run.steps.n).toMatchObject({ attempts: 1, output: { text: 'got A' } });
	});
});

describe('loops', () => {
	const greetings = () => {
		const flow = registry.flow('Greet');
		const loop = flow.add('rt.each', { items: '{{ trigger.users }}' }, { id: 'each' });
		flow.add('rt.start', {}, { id: 's' }).to(loop);
		loop.on('item').to(flow.add('rt.note', { text: 'Hi {{ $item.name }} (#{{ $index }})' }, { id: 'greet' }));
		loop.on('done').to(flow.add('rt.note', { text: '{{ input | length }} greeted: {{ input | map: "text" | join: "; " }}' }, { id: 'summary' }));
		return flow.build();
	};

	it('runs the item branch once per item and collects results', async () => {
		const run = await createEngine(registry).start(greetings(), { payload: { users: [{ name: 'Ann' }, { name: 'Bo' }] } });
		expect(run.status).toBe('completed');
		expect(run.steps['each[1]/greet'].output).toEqual({ text: 'Hi Bo (#1)' });
		expect(run.steps.each.output).toEqual([{ text: 'Hi Ann (#0)' }, { text: 'Hi Bo (#1)' }]);
		expect(run.steps.summary.output).toEqual({ text: '2 greeted: Hi Ann (#0); Hi Bo (#1)' });
	});

	it('handles an empty list', async () => {
		const run = await createEngine(registry).start(greetings(), { payload: { users: [] } });
		expect(run.status).toBe('completed');
		expect(run.steps.each.output).toEqual([]);
		expect(run.steps.greet.status).toBe('skipped');
		expect(run.steps.summary.output).toEqual({ text: '0 greeted: ' });
	});

	it('pauses inside a loop and resumes each iteration by key', async () => {
		const flow = registry.flow('Approvals');
		const loop = flow.add('rt.each', { items: [1, 2] }, { id: 'each' });
		const ok = flow.add('rt.approve', {}, { id: 'ok' });
		flow.add('rt.start', {}, { id: 's' }).to(loop);
		loop.on('item').to(ok).on('yes').to(flow.add('rt.note', { text: 'approved {{ $item }}' }, { id: 'thanks' }));
		loop.on('done').to(flow.add('rt.note', { text: '{{ input | length }}' }, { id: 'summary' }));
		const json = flow.build();
		const engine = createEngine(registry);

		let run = await engine.start(json);
		expect(run.status).toBe('waiting');
		expect(waitingSteps(run)).toEqual([{ key: 'each[0]/ok', nodeId: 'ok', reason: 'approval', data: { index: 0 } }]);
		await expect(engine.resume(json, run, { nodeId: 'each', data: {} })).rejects.toThrow(/resume the waiting step inside it: each\[0\]\/ok/);

		run = await engine.resume(json, run, { nodeId: 'each[0]/ok', data: { ok: true } });
		expect(run.status).toBe('waiting');
		expect(waitingSteps(run).map((step) => step.key)).toEqual(['each[1]/ok']);

		run = await engine.resume(json, JSON.parse(JSON.stringify(run)), { nodeId: 'each[1]/ok', data: { ok: false } });
		expect(run.status).toBe('completed');
		expect(run.steps['each[1]/thanks'].status).toBe('skipped');
		expect(run.steps.each.output).toEqual([{ text: 'approved 1' }, undefined]);
		expect(run.steps.summary.output).toEqual({ text: '2' });
	});

	it('rejects connections that leave a loop body', () => {
		const result = registry.parse({
			version: 1,
			name: 'Escape',
			nodes: [
				{ id: 's', kind: 'rt.start' },
				{ id: 'each', kind: 'rt.each', config: { items: [1] } },
				{ id: 'inside', kind: 'rt.note', config: { text: 'a' } },
				{ id: 'after', kind: 'rt.note', config: { text: 'b' } }
			],
			edges: [
				{ from: 's', to: 'each' },
				{ from: 'each', port: 'item', to: 'inside' },
				{ from: 'inside', to: 'after' },
				{ from: 'each', port: 'done', to: 'after' }
			]
		});
		expect(result.ok).toBe(false);
		expect(result.issues.map((issue) => `${issue.code}@${issue.path}`)).toContain('loop_body_escape@edges[3]');
	});
});

describe('credentials', () => {
	const flow = () => {
		const builder = registry.flow('Secret');
		builder.add('rt.start').to(builder.add('rt.secret', { token: 'cred_1' }, { id: 'use' }));
		return builder.build();
	};

	it('resolves secrets at run time without storing them', async () => {
		const resolve = vi.fn(async () => 'SUPER-SECRET-TOKEN');
		const run = await createEngine(registry, { services: { credentials: { resolve } } }).start(flow());
		expect(run.steps.use.output).toEqual({ length: 18 });
		expect(resolve).toHaveBeenCalledWith({ id: 'cred_1', type: 'api-token', runId: run.id, nodeId: 'use' });
		expect(JSON.stringify(run)).not.toContain('SUPER-SECRET');
	});

	it('fails clearly without a resolver', async () => {
		const run = await createEngine(registry).start(flow());
		expect(run.status).toBe('failed');
		expect(run.error?.message).toMatch(/services\.credentials/);
	});
});

describe('expression filters', () => {
	const scope = { input: { items: [{ price: 2, name: 'a' }, { price: 3.456, name: 'b' }] }, vars: { title: ' Hi ' } };

	it('chains filters and keeps types', () => {
		expect(resolveTemplates('{{ input.items | map: "price" | sum | round: 1 }}', scope)).toBe(5.5);
		expect(resolveTemplates('{{ input.items | length }}', scope)).toBe(2);
		expect(resolveTemplates('{{ input.items | first | json }}', scope)).toBe('{"price":2,"name":"a"}');
		expect(resolveTemplates('{{ vars.title | trim | upper }}!', scope)).toBe('HI!');
		expect(resolveTemplates('{{ vars.missing | default: "none" }}', scope)).toBe('none');
		expect(resolveTemplates('{{ input.items | map: "name" | join: " | " }}', scope)).toBe('a | b');
	});

	it('reports unknown filters and roots', () => {
		expect(checkExpression('input.items | explode')).toBe('Unknown filter "explode".');
		expect(checkExpression('window.location')).toMatch(/must start with/);
		expect(checkExpression('$item.name | upper')).toBeNull();
		expect(() => resolveTemplates('{{ input | explode }}', scope)).toThrow('Unknown filter');
	});

	it('flags invalid expressions during validation', () => {
		const builder = registry.flow('Bad filter');
		builder.add('rt.start').to(builder.add('rt.note', { text: '{{ input | explode }}' }, { id: 'n' }));
		expect(builder.validate().map((issue) => issue.code)).toContain('invalid_expression');
	});
});

describe('LLM helpers', () => {
	it('describe loops, joins, credentials and filters', () => {
		const text = registry.describe();
		expect(text).toContain('`token`: credential id (type "api-token")');
		expect(text).toContain('- Loop: steps on `item` run once per item');
		expect(text).toContain('- Waits for every incoming branch before running.');
		expect(text).toContain('Filters:');
		expect(JSON.stringify(registry.toJSONSchema())).toContain('"join"');
	});
});
