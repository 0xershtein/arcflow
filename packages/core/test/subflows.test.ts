import { beforeEach, describe, expect, it } from 'vitest';
import { createEngine, createRegistry, defineNode, f, waitingSteps, type Flow, type RunEvent } from '../src/index.js';

const finished: number[] = [];

const start = defineNode({ kind: 'sf.start', title: 'Start', description: 'Starts the flow.', trigger: true, run: (ctx) => ({ output: ctx.input }) });

const note = defineNode({
	kind: 'sf.note',
	title: 'Note',
	description: 'Outputs its text.',
	config: { text: f.text() },
	run: (ctx) => ({ output: { text: ctx.config.text } })
});

const approve = defineNode({
	kind: 'sf.approve',
	title: 'Approve',
	description: 'Waits for a person.',
	outputs: [{ id: 'yes' }, { id: 'no' }],
	run: (ctx) => (ctx.resumed ? { port: (ctx.resumed.data as { ok: boolean }).ok ? 'yes' : 'no' } : { wait: { reason: 'approval' } })
});

const call = defineNode({
	kind: 'sf.call',
	title: 'Call',
	description: 'Runs another flow.',
	outputs: [{ id: 'out' }, { id: 'error' }],
	config: { flow: f.string(), input: f.json({ optional: true }) },
	run: (ctx) => ({ call: { flow: ctx.config.flow, input: ctx.config.input } })
});

const pause = defineNode({
	kind: 'sf.pause',
	title: 'Pause',
	description: 'Waits a few milliseconds.',
	config: { ms: f.json() },
	run: async (ctx) => {
		const ms = Number(ctx.config.ms);
		await new Promise((resolve) => setTimeout(resolve, ms));
		finished.push(ms);
		return { output: { ms } };
	}
});

const each = defineNode({
	kind: 'sf.each',
	title: 'Each',
	description: 'Runs its body per item.',
	loop: true,
	outputs: [{ id: 'item' }, { id: 'done' }],
	config: { items: f.json(), concurrency: f.number({ integer: true, min: 1, default: 1 }) },
	run: (ctx) => ({ loop: { items: ctx.config.items as unknown[], concurrency: ctx.config.concurrency } })
});

const blob = defineNode({
	kind: 'sf.blob',
	title: 'Blob',
	description: 'Outputs a long string.',
	config: { size: f.number() },
	run: (ctx) => ({ output: 'x'.repeat(ctx.config.size) })
});

const bigint = defineNode({ kind: 'sf.bigint', title: 'BigInt', description: 'Outputs a BigInt.', run: () => ({ output: { n: BigInt(1) } }) });

const registry = createRegistry([start, note, approve, call, pause, each, blob, bigint]);

const library: Record<string, Flow> = {};
const flows = { get: (id: string) => library[id] };

{
	const echo = registry.flow('Echo');
	echo.add('sf.start', {}, { id: 's' }).to(echo.add('sf.note', { text: 'child got {{ trigger.value }}' }, { id: 'reply' }));
	library.echo = echo.build();

	const ask = registry.flow('Ask');
	const ok = ask.add('sf.approve', {}, { id: 'ok' });
	ask.add('sf.start', {}, { id: 's' }).to(ok);
	ok.on('yes').to(ask.add('sf.note', { text: 'approved' }, { id: 'yes' }));
	ok.on('no').to(ask.add('sf.note', { text: 'declined' }, { id: 'no' }));
	library.ask = ask.build();

	const self = registry.flow('Self');
	self.add('sf.start', {}, { id: 's' }).to(self.add('sf.call', { flow: 'self' }, { id: 'again' }));
	library.self = self.build();
}

function parent(flowId: string) {
	const flow = registry.flow('Parent');
	const step = flow.add('sf.call', { flow: flowId, input: '{{ trigger }}' }, { id: 'call' });
	flow.add('sf.start', {}, { id: 's' }).to(step);
	step.on('out').to(flow.add('sf.note', { text: 'parent saw {{ input.text }}' }, { id: 'after' }));
	return flow.build();
}

describe('sub-flows', () => {
	it('runs a sub-flow and continues with its result', async () => {
		const events: RunEvent[] = [];
		const run = await createEngine(registry, { flows }).start(parent('echo'), { payload: { value: 7 }, onEvent: (e) => events.push(e) });
		expect(run.status).toBe('completed');
		expect(run.steps.call.output).toEqual({ text: 'child got 7' });
		expect(run.steps.after.output).toEqual({ text: 'parent saw child got 7' });
		expect(run.steps.call.child?.state.status).toBe('completed');
		expect(events.some((e) => e.type === 'step:success' && e.key === 'call>reply')).toBe(true);
	});

	it('waits inside a sub-flow and resumes through the calling step', async () => {
		const engine = createEngine(registry, { flows });
		const json = parent('ask');
		const waiting = await engine.start(json);

		expect(waiting.status).toBe('waiting');
		expect(waitingSteps(waiting)).toEqual([{ key: 'call>ok', nodeId: 'ok', reason: 'approval' }]);
		await expect(engine.resume(json, waiting, { nodeId: 'call', data: {} })).rejects.toThrow(/resume the waiting step inside it: call>ok/);

		const done = await engine.resume(json, JSON.parse(JSON.stringify(waiting)), { nodeId: 'call>ok', data: { ok: false } });
		expect(done.status).toBe('completed');
		expect(done.steps.call.output).toEqual({ text: 'declined' });
		expect(done.steps.after.output).toEqual({ text: 'parent saw declined' });
	});

	it('fails clearly when a flow is missing or there is no source', async () => {
		const missing = await createEngine(registry, { flows }).start(parent('nope'));
		expect(missing.status).toBe('failed');
		expect(missing.error?.message).toMatch(/No flow "nope"/);

		const noSource = await createEngine(registry).start(parent('echo'));
		expect(noSource.error?.message).toMatch(/no flows source/);
	});

	it('stops runaway recursion', async () => {
		const run = await createEngine(registry, { flows, maxDepth: 3 }).start(library.self);
		expect(run.status).toBe('failed');
		expect(run.error?.message).toMatch(/more than 3 levels/);
	});
});

describe('loop concurrency', () => {
	beforeEach(() => {
		finished.length = 0;
	});

	const timed = (concurrency: number) => {
		const flow = registry.flow('Timed');
		const loop = flow.add('sf.each', { items: [30, 10, 20], concurrency }, { id: 'each' });
		flow.add('sf.start', {}, { id: 's' }).to(loop);
		loop.on('item').to(flow.add('sf.pause', { ms: '{{ $item }}' }, { id: 'pause' }));
		return flow.build();
	};

	it('keeps result order while running iterations in parallel', async () => {
		const sequential = await createEngine(registry).start(timed(1));
		expect(finished).toEqual([30, 10, 20]);
		expect(sequential.steps.each.output).toEqual([{ ms: 30 }, { ms: 10 }, { ms: 20 }]);

		finished.length = 0;
		const parallel = await createEngine(registry).start(timed(3));
		expect(finished).toEqual([10, 20, 30]);
		expect(parallel.steps.each.output).toEqual([{ ms: 30 }, { ms: 10 }, { ms: 20 }]);
	});

	it('lets parallel iterations wait and be resumed in any order', async () => {
		const flow = registry.flow('Parallel approvals');
		const loop = flow.add('sf.each', { items: ['a', 'b'], concurrency: 2 }, { id: 'each' });
		const ok = flow.add('sf.approve', {}, { id: 'ok' });
		flow.add('sf.start', {}, { id: 's' }).to(loop);
		loop.on('item').to(ok).on('yes').to(flow.add('sf.note', { text: 'yes {{ $item }}' }, { id: 'yes' }));
		const json = flow.build();
		const engine = createEngine(registry);

		let run = await engine.start(json);
		expect(waitingSteps(run).map((step) => step.key)).toEqual(['each[0]/ok', 'each[1]/ok']);

		run = await engine.resume(json, run, { nodeId: 'each[1]/ok', data: { ok: true } });
		expect(run.status).toBe('waiting');
		expect(waitingSteps(run).map((step) => step.key)).toEqual(['each[0]/ok']);

		run = await engine.resume(json, run, { nodeId: 'each[0]/ok', data: { ok: true } });
		expect(run.status).toBe('completed');
		expect(run.steps.each.output).toEqual([{ text: 'yes a' }, { text: 'yes b' }]);
	});
});

describe('output checks', () => {
	const blobFlow = (size: number) => {
		const flow = registry.flow('Blob');
		flow.add('sf.start', {}, { id: 's' }).to(flow.add('sf.blob', { size }, { id: 'out' }));
		return flow.build();
	};

	const bigintFlow = () => {
		const flow = registry.flow('BigInt');
		flow.add('sf.start', {}, { id: 's' }).to(flow.add('sf.bigint', {}, { id: 'out' }));
		return flow.build();
	};

	it('enforces maxOutputBytes', async () => {
		const engine = createEngine(registry, { maxOutputBytes: 100 });
		expect((await engine.start(blobFlow(50))).status).toBe('completed');
		const tooBig = await engine.start(blobFlow(500));
		expect(tooBig.status).toBe('failed');
		expect(tooBig.error?.message).toMatch(/502 bytes of output; the limit is 100/);
	});

	it('requires JSON-serializable output', async () => {
		const run = await createEngine(registry).start(bigintFlow());
		expect(run.status).toBe('failed');
		expect(run.error?.message).toMatch(/not JSON-serializable/);
	});
});
