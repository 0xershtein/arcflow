import { describe, expect, it } from 'vitest';
import { FlowError, createEngine, waitingSteps, type RunEvent } from '../src/index.js';
import { paymentFlow, registry } from './fixtures.js';

const clock = () => {
	let t = 0;
	return () => ++t;
};

describe('engine', () => {
	it('simulates a whole flow, sharing vars and outputs', async () => {
		const engine = createEngine(registry, { now: clock() });
		const events: RunEvent['type'][] = [];
		const run = await engine.start(paymentFlow().build(), { mode: 'simulate', onEvent: (e) => events.push(e.type) });

		expect(run.status).toBe('completed');
		expect(run.vars.balance).toBe(60); // sample balance 100 − 40
		expect(run.steps.sign.ports).toEqual(['approved']);
		expect(run.steps.done.output).toEqual({ text: 'Paid 40' });
		expect(run.steps.low.status).toBe('skipped');
		expect(events[0]).toBe('run:start');
		expect(events.at(-1)).toBe('run:end');
	});

	it('pauses at a waiting step and resumes by re-running it', async () => {
		const engine = createEngine(registry);
		const flow = paymentFlow().build();
		const waiting = await engine.start(flow, { vars: { balance: 500 } });

		expect(waiting.status).toBe('waiting');
		expect(waitingSteps(waiting)).toEqual([{ nodeId: 'sign', reason: 'approval', data: { signers: ['a', 'b'] } }]);
		expect(waiting.steps.send).toBeUndefined();

		// the state survives a JSON round trip, e.g. a database
		const stored = JSON.parse(JSON.stringify(waiting));
		const done = await engine.resume(flow, stored, { nodeId: 'sign', data: { approved: true } });
		expect(done.status).toBe('completed');
		expect(done.vars.balance).toBe(460);
		expect(stored.status).toBe('waiting'); // snapshot untouched
	});

	it('resumes with an explicit port', async () => {
		const engine = createEngine(registry);
		const flow = paymentFlow().build();
		const waiting = await engine.start(flow, { vars: { balance: 500 } });
		const rejected = await engine.resume(flow, waiting, { nodeId: 'sign', port: 'rejected' });
		expect(rejected.status).toBe('completed');
		expect(rejected.steps.send.status).toBe('skipped');
		await expect(engine.resume(flow, rejected, { nodeId: 'sign', port: 'approved' })).rejects.toThrow(/not waiting/);
	});

	it('retries, then routes failures to a connected error port', async () => {
		const engine = createEngine(registry);
		const build = (failTimes: number, withErrorBranch: boolean) => {
			const flow = registry.flow('Retry');
			const flaky = flow.add('test.start').to(flow.add('test.flaky', { failTimes }, { id: 'flaky' }));
			flaky.on('out').to(flow.add('test.note', { text: 'ok' }, { id: 'ok' }));
			if (withErrorBranch) flaky.on('error').to(flow.add('test.note', { text: 'failed: {{ input.error }}' }, { id: 'oops' }));
			return flow.build();
		};

		const retries: number[] = [];
		const recovered = await engine.start(build(2, false), { onEvent: (e) => e.type === 'step:retry' && retries.push(e.attempt) });
		expect(recovered.status).toBe('completed');
		expect(recovered.steps.flaky).toMatchObject({ attempts: 3, output: { attempt: 3 } });
		expect(retries).toEqual([1, 2]);

		const handled = await engine.start(build(5, true));
		expect(handled.status).toBe('completed');
		expect(handled.steps.oops.output).toEqual({ text: 'failed: boom 3' });

		const failed = await engine.start(build(5, false));
		expect(failed.status).toBe('failed');
		expect(failed.error).toEqual({ message: 'boom 3', nodeId: 'flaky' });
		expect(failed.steps.ok.status).toBe('skipped');
	});

	it('can be cancelled', async () => {
		const engine = createEngine(registry);
		const controller = new AbortController();
		const running = engine.start(paymentFlow().build(), { mode: 'simulate', stepDelayMs: 20, signal: controller.signal });
		setTimeout(() => controller.abort(), 30);
		const run = await running;
		expect(run.status).toBe('cancelled');
		expect(Object.values(run.steps).some((s) => s.status === 'skipped')).toBe(true);
	});

	it('refuses to start invalid flows', async () => {
		const engine = createEngine(registry);
		await expect(engine.start({ version: 1, name: 'x', nodes: [], edges: [] })).rejects.toBeInstanceOf(FlowError);
	});

	it('fails a step whose resolved config is invalid', async () => {
		const engine = createEngine(registry);
		const flow = registry.flow('Bad expression');
		flow.add('test.start').to(flow.add('test.if', { value: '{{ vars.missing }}' }, { id: 'check' }));
		const run = await engine.start(flow.build());
		expect(run.status).toBe('failed');
		expect(run.error?.message).toMatch(/value: Value is required/);
	});
});
