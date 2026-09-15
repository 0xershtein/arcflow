import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEngine, waitingSteps } from '@arcflow/core';
import { createTodoDigestFlow, evaluateCondition, nextRuns, runSandboxed, standardRegistry } from '../src/index.js';

type Builder = ReturnType<typeof standardRegistry.flow>;

/** Builds a flow that starts with a manual trigger with id "start". */
function flowWith(build: (flow: Builder, start: ReturnType<Builder['add']>) => void) {
	const flow = standardRegistry.flow('Test');
	build(flow, flow.add('trigger.manual', {}, { id: 'start' }));
	return flow.build();
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('conditions', () => {
	it.each([
		['5', 'equals', 5, true],
		['10', 'gt', 9, true],
		['apple', 'lt', 'banana', true],
		[[1, 2], 'contains', '2', true],
		['hello world', 'contains', 'lo w', true],
		['abc', 'matches', '^a.c$', true],
		[{}, 'is_empty', undefined, true],
		['x', 'is_not_empty', undefined, true],
		['true', 'is_true', undefined, true],
		['report.pdf', 'ends_with', '.pdf', true],
		[3, 'not_equals', 3, false]
	] as const)('%j %s %j → %s', (left, operator, right, expected) => {
		expect(evaluateCondition(left, operator, right)).toBe(expected);
	});
});

describe('flow control and data', () => {
	it('branches with If on all or any conditions', async () => {
		const build = (combine: 'all' | 'any') =>
			flowWith((flow, start) => {
				const check = flow.add(
					'logic.if',
					{
						combine,
						conditions: [
							{ left: '{{ input.total }}', operator: 'gt', right: 100 },
							{ left: '{{ input.status }}', operator: 'equals', right: 'paid' }
						]
					},
					{ id: 'check' }
				);
				start.to(check);
				check.on('true').to(flow.add('data.set', { fields: [{ name: 'result', value: 'yes' }] }, { id: 'yes' }));
				check.on('false').to(flow.add('data.set', { fields: [{ name: 'result', value: 'no' }] }, { id: 'no' }));
			});
		const payload = { total: 120, status: 'open' };
		const engine = createEngine(standardRegistry);
		expect((await engine.start(build('all'), { payload })).steps.no.status).toBe('success');
		expect((await engine.start(build('any'), { payload })).steps.yes.output).toEqual({ total: 120, status: 'open', result: 'yes' });
	});

	it('routes Switch cases and sets nested fields', async () => {
		const flow = flowWith((flow, start) => {
			const choose = flow.add('logic.switch', { value: '{{ input.plan }}', cases: [{ equals: 'free' }, { equals: 'pro' }] }, { id: 'choose' });
			start.to(choose);
			choose.on('case2').to(flow.add('data.set', { fields: [{ name: 'limits.seats', value: 10 }], keepInput: false }, { id: 'pro' }));
			choose.on('otherwise').to(flow.add('data.set', { fields: [{ name: 'limits.seats', value: 1 }], keepInput: false }, { id: 'other' }));
		});
		const run = await createEngine(standardRegistry).start(flow, { payload: { plan: 'pro' } });
		expect(run.steps.pro.output).toEqual({ limits: { seats: 10 } });
		expect(run.steps.other.status).toBe('skipped');
	});

	it('merges branches once both have finished', async () => {
		const flow = flowWith((flow, start) => {
			const merge = flow.add('logic.merge', {}, { id: 'merge' });
			start.to(flow.add('data.set', { fields: [{ name: 'a', value: 1 }], keepInput: false }, { id: 'a' })).to(merge);
			start.to(flow.add('data.set', { fields: [{ name: 'b', value: 2 }], keepInput: false }, { id: 'b' })).to(merge);
		});
		const run = await createEngine(standardRegistry).start(flow);
		expect(run.steps.merge.output).toEqual({ a: 1, b: 2 });
	});

	it('loops with a Code body', async () => {
		const flow = flowWith((flow, start) => {
			const loop = flow.add('logic.loop', { items: [1, 2, 3], concurrency: 2 }, { id: 'loop' });
			start.to(loop);
			loop.on('item').to(flow.add('code.javascript', { code: 'return $item * 10 + $index;' }, { id: 'times' }));
			loop.on('done').to(flow.add('code.javascript', { code: 'return input.reduce((a, b) => a + b, 0);' }, { id: 'sum' }));
		});
		const run = await createEngine(standardRegistry).start(flow);
		expect(run.steps.loop.output).toEqual([10, 21, 32]);
		expect(run.steps.sum.output).toBe(63);
	});

	it('waits in place for short durations and pauses for long ones', async () => {
		const wait = (amount: number, unit: 'seconds' | 'hours') =>
			flowWith((flow, start) => start.to(flow.add('logic.wait', { amount, unit }, { id: 'wait' })).to(flow.add('data.set', { fields: [{ name: 'done', value: true }] }, { id: 'after' })));
		const engine = createEngine(standardRegistry);

		const short = await engine.start(wait(0.02, 'seconds'));
		expect(short.status).toBe('completed');

		const longFlow = wait(2, 'hours');
		const paused = await engine.start(longFlow);
		expect(paused.status).toBe('waiting');
		const [step] = waitingSteps(paused);
		expect(step).toMatchObject({ key: 'wait', reason: 'timer' });
		expect(Date.parse((step.data as { until: string }).until)).toBeGreaterThan(Date.now() + 3_500_000);
		expect((await engine.resume(longFlow, paused, { nodeId: 'wait', data: {} })).status).toBe('completed');

		expect((await engine.start(longFlow, { mode: 'simulate' })).status).toBe('completed');
	});

	it('runs sub-flows with Run flow', async () => {
		const child = flowWith((flow, start) => start.to(flow.add('data.set', { fields: [{ name: 'greeting', value: 'hi {{ trigger.name }}' }], keepInput: false }, { id: 'greet' })));
		const parent = flowWith((flow, start) => start.to(flow.add('flow.call', { flow: 'greeter' }, { id: 'call' })));
		const run = await createEngine(standardRegistry, { flows: { get: () => child } }).start(parent, { payload: { name: 'Ada' } });
		expect(run.steps.call.output).toEqual({ greeting: 'hi Ada' });
	});
});

describe('code sandbox', () => {
	it('returns values and captures console output', async () => {
		const logs: string[] = [];
		const value = await runSandboxed('console.log("sum", a + b); return { total: a + b, list: [a, b] };', {
			globals: { a: 2, b: 3 },
			onLog: (line) => logs.push(line)
		});
		expect(value).toEqual({ total: 5, list: [2, 3] });
		expect(logs).toEqual(['sum 5']);
	});

	it('has no access to the host', async () => {
		expect(await runSandboxed('return [typeof fetch, typeof process, typeof require, typeof globalThis.setTimeout];')).toEqual([
			'undefined',
			'undefined',
			'undefined',
			'undefined'
		]);
	});

	it('stops runaway code and reports errors', async () => {
		await expect(runSandboxed('while (true) {}', { timeoutMs: 50 })).rejects.toThrow('Code ran longer than 50 ms.');
		await expect(runSandboxed('return missing.value;')).rejects.toThrow(/ReferenceError/);
		await expect(runSandboxed('return {')).rejects.toThrow(/SyntaxError/);
	});

	it('routes code errors to the error output', async () => {
		const flow = flowWith((flow, start) => {
			const code = flow.add('code.javascript', { code: 'throw new Error("bad data")' }, { id: 'code' });
			start.to(code);
			code.on('error').to(flow.add('data.set', { fields: [{ name: 'caught', value: '{{ input.error }}' }], keepInput: false }, { id: 'caught' }));
		});
		const run = await createEngine(standardRegistry).start(flow);
		expect(run.status).toBe('completed');
		expect(run.steps.caught.output).toEqual({ caught: 'Error: bad data' });
	});
});

describe('HTTP request', () => {
	it('sends queries, headers, JSON bodies and credentials', async () => {
		const fetchMock = vi.fn(async (_url: URL, _init?: RequestInit) => json({ id: 7 }, 201));
		vi.stubGlobal('fetch', fetchMock);
		const flow = flowWith((flow, start) =>
			start.to(
				flow.add(
					'http.request',
					{
						method: 'POST',
						url: 'https://api.example.com/items',
						query: [{ name: 'dry', value: '1' }],
						headers: [{ name: 'x-trace', value: '{{ input.trace }}' }],
						body: { name: '{{ input.name }}' },
						auth: 'api'
					},
					{ id: 'create' }
				)
			)
		);
		const resolve = vi.fn(async () => ({ type: 'bearer', token: 't0k' }));
		const run = await createEngine(standardRegistry, { services: { credentials: { resolve } } }).start(flow, { payload: { trace: 'abc', name: 'Desk' } });

		expect(run.steps.create.output).toMatchObject({ status: 201, ok: true, body: { id: 7 } });
		const [url, init] = fetchMock.mock.calls[0];
		expect(String(url)).toBe('https://api.example.com/items?dry=1');
		const headers = new Headers(init?.headers);
		expect(headers.get('authorization')).toBe('Bearer t0k');
		expect(headers.get('x-trace')).toBe('abc');
		expect(init?.body).toBe('{"name":"Desk"}');
		expect(JSON.stringify(run)).not.toContain('t0k');
	});

	it('fails on error statuses unless told not to, and skips writes in test runs', async () => {
		const fetchMock = vi.fn(async () => json({ message: 'nope' }, 500));
		vi.stubGlobal('fetch', fetchMock);
		const request = (method: 'GET' | 'DELETE', failOnError: boolean) =>
			flowWith((flow, start) => start.to(flow.add('http.request', { method, url: 'https://api.example.com/x', failOnError }, { id: 'req' })));
		const engine = createEngine(standardRegistry);

		const failed = await engine.start(request('GET', true));
		expect(failed.status).toBe('failed');
		expect(failed.error?.message).toMatch(/returned 500/);

		const tolerated = await engine.start(request('GET', false));
		expect(tolerated.steps.req.output).toMatchObject({ status: 500, ok: false, body: { message: 'nope' } });

		fetchMock.mockClear();
		const simulated = await engine.start(request('DELETE', true), { mode: 'simulate' });
		expect(simulated.steps.req.output).toMatchObject({ simulated: true });
		expect(fetchMock).not.toHaveBeenCalled();
	});
});

describe('schedule', () => {
	it('computes upcoming runs and rejects invalid expressions', () => {
		const runs = nextRuns('0 9 * * 1-5', 'UTC', 2, new Date('2026-09-18T10:00:00Z'));
		expect(runs.map((date) => date.toISOString())).toEqual(['2026-09-21T09:00:00.000Z', '2026-09-22T09:00:00.000Z']);

		const bad = standardRegistry.flow('Bad schedule');
		bad.add('trigger.schedule', { cron: 'every tuesday' });
		expect(bad.validate().map((issue) => issue.code)).toContain('check_failed');
	});
});

describe('example: open to-do digest', () => {
	it('fetches, filters in code, branches and posts', async () => {
		const fetchMock = vi.fn(async (url: URL, init?: RequestInit) =>
			init?.method === 'POST'
				? json({ received: JSON.parse(String(init.body)) })
				: json([
						{ title: 'write docs', completed: false },
						{ title: 'ship', completed: true },
						{ title: 'test', completed: false }
					])
		);
		vi.stubGlobal('fetch', fetchMock);

		const run = await createEngine(standardRegistry).start(createTodoDigestFlow());
		expect(run.status).toBe('completed');
		expect(run.steps.open.output).toEqual({ count: 2, titles: ['write docs', 'test'] });
		expect(run.steps.open.logs?.[0].message).toBe('2 of 3 open');
		expect(run.steps.post.output).toMatchObject({ body: { received: { text: '2 open: write docs, test' } } });
		expect(run.steps.quiet.status).toBe('skipped');
	});
});
