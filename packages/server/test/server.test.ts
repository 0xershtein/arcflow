import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRegistry, registryFromManifest, type Flow } from '@arcsig-labs/core';
import { standardSteps } from '@arcsig-labs/nodes';
import { createServer, type ServerOptions } from '../src/index.js';
import { SqliteStorage } from '../src/node.js';

const registry = createRegistry([standardSteps]);
const SECRET = 'a-test-secret-that-is-long-enough';

async function setup(overrides: Partial<ServerOptions> = {}) {
	const server = await createServer({ registry, secret: SECRET, onError: () => {}, ...overrides });
	const call = async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => {
		const response = await server.app.request(path, {
			method,
			headers: { 'content-type': 'application/json', ...headers },
			body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body)
		});
		const text = await response.text();
		let parsed: unknown = text;
		try {
			parsed = text ? JSON.parse(text) : undefined;
		} catch {
			// not JSON
		}
		return { status: response.status, body: parsed as Record<string, any>, headers: response.headers };
	};
	return { server, call };
}

function build(name: string, add: (flow: ReturnType<typeof registry.flow>) => void): Flow {
	const flow = registry.flow(name);
	add(flow);
	return flow.build();
}

const waitingFlow = build('Wait two hours', (flow) => {
	flow
		.add('trigger.manual', {}, { id: 'start' })
		.to(flow.add('logic.wait', { amount: 2, unit: 'hours' }, { id: 'wait' }))
		.to(flow.add('data.set', { fields: [{ name: 'done', value: true }], keepInput: false }, { id: 'after' }));
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('flows API', () => {
	it('saves drafts with issues but refuses to activate them', async () => {
		const { call } = await setup();
		const draft = { version: 1, name: 'Draft', nodes: [{ id: 'n', kind: 'data.set', config: {} }], edges: [] };

		const saved = await call('POST', '/api/flows', { id: 'draft', flow: draft });
		expect(saved.status).toBe(201);
		expect(saved.body.issues.map((issue: { code: string }) => issue.code)).toContain('no_trigger');

		const activate = await call('PUT', '/api/flows/draft', { flow: draft, active: true });
		expect(activate.status).toBe(422);

		const validate = await call('POST', '/api/flows/validate', draft);
		expect(validate.body.ok).toBe(false);
	});

	it('versions flows and lists them with their triggers', async () => {
		const { call } = await setup();
		await call('POST', '/api/flows', { id: 'waiter', flow: waitingFlow });
		const updated = await call('PUT', '/api/flows/waiter', { flow: { ...waitingFlow, name: 'Renamed' } });
		expect(updated.body.flow).toMatchObject({ version: 2, name: 'Renamed' });

		const list = await call('GET', '/api/flows');
		expect(list.body.flows).toEqual([expect.objectContaining({ id: 'waiter', version: 2, triggers: [{ id: 'start', kind: 'trigger.manual' }] })]);
	});

	it('describes steps for editors and agents', async () => {
		const { call } = await setup();
		const steps = await call('GET', '/api/steps');
		expect(steps.body.steps.find((step: { kind: string }) => step.kind === 'http.request')).toMatchObject({ outputs: [{ id: 'out' }, { id: 'error', label: 'Error' }] });
		expect(steps.body.catalog).toContain('`logic.loop`');
		// The manifest is what a browser editor rebuilds a registry from.
		const remote = registryFromManifest(steps.body.manifest);
		expect(remote.nodes.map((node) => node.kind)).toEqual(registry.nodes.map((node) => node.kind));
		expect(remote.parse(waitingFlow).ok).toBe(true);
	});

	it('requires the API key when configured', async () => {
		const { call } = await setup({ apiKey: 'k3y' });
		expect((await call('GET', '/api/flows')).status).toBe(401);
		expect((await call('GET', '/api/flows', undefined, { authorization: 'Bearer k3y' })).status).toBe(200);
	});
});

describe('runs', () => {
	it('runs a flow through the API and keeps its history', async () => {
		const { call } = await setup();
		const flow = build('Greet', (f) => f.add('trigger.manual', {}, { id: 'start' }).to(f.add('data.set', { fields: [{ name: 'hello', value: '{{ trigger.name }}' }], keepInput: false }, { id: 'greet' })));
		await call('POST', '/api/flows', { id: 'greet', flow });

		const started = await call('POST', '/api/flows/greet/runs', { payload: { name: 'Ada' }, wait: true });
		expect(started.body.run.status).toBe('completed');

		const detail = await call('GET', `/api/runs/${started.body.run.id}`);
		expect(detail.body.result).toEqual({ hello: 'Ada' });

		const history = await call('GET', '/api/runs?flowId=greet');
		expect(history.body.runs).toEqual([expect.objectContaining({ id: started.body.run.id, status: 'completed', trigger: { type: 'api' } })]);
	});

	it('resumes and cancels waiting runs', async () => {
		const { call } = await setup();
		await call('POST', '/api/flows', { id: 'waiter', flow: waitingFlow });

		const first = await call('POST', '/api/flows/waiter/runs', { wait: true });
		expect(first.body.run).toMatchObject({ status: 'waiting' });
		expect(first.body.run.wakeAt).toBeGreaterThan(Date.now() + 3_500_000);

		const resumed = await call('POST', `/api/runs/${first.body.run.id}/resume`, { nodeId: 'wait', wait: true });
		expect(resumed.body.run.status).toBe('completed');
		expect((await call('POST', `/api/runs/${first.body.run.id}/resume`, { nodeId: 'wait' })).status).toBe(409);

		const second = await call('POST', '/api/flows/waiter/runs', { wait: true });
		expect((await call('POST', `/api/runs/${second.body.run.id}/cancel`)).status).toBe(200);
		expect((await call('GET', `/api/runs/${second.body.run.id}`)).body.run.status).toBe('cancelled');
	});

	it('streams run events', async () => {
		const { server, call } = await setup();
		const flow = build('Slow', (f) => f.add('trigger.manual', {}, { id: 'start' }).to(f.add('logic.wait', { amount: 0.2, unit: 'seconds' }, { id: 'pause' })));
		await call('POST', '/api/flows', { id: 'slow', flow });

		const started = await call('POST', '/api/flows/slow/runs', {});
		expect(started.status).toBe(202);
		const response = await server.app.request(`/api/runs/${started.body.run.id}/events`);
		const text = await response.text();
		expect(text).toContain('event: step:success');
		expect(text).toMatch(/event: run:end\ndata: .*"status":"completed"/);
	});
});

describe('flow generation', () => {
	it('answers 501 until a model is configured, about the feature that was asked for', async () => {
		const { call } = await setup();
		const generate = await call('POST', '/api/ai/generate', { prompt: 'wait two hours' });
		expect(generate.status).toBe(501);
		expect(generate.body.error).toContain('ANTHROPIC_API_KEY');
		expect(generate.body.error).toContain('Flow generation is off');

		// Explaining a flow is not generating one; the message says which is off.
		const explain = await call('POST', '/api/ai/explain', { flow: waitingFlow });
		expect(explain.status).toBe(501);
		expect(explain.body.error).toContain('Explaining flows is off');
		expect((await call('POST', '/api/ai/edit', { flow: waitingFlow, instruction: 'x' })).body.error).toContain('Editing flows is off');
	});

	it('reports what it has configured on /api/health', async () => {
		const bare = await setup({ secret: undefined });
		expect((await bare.call('GET', '/api/health')).body).toEqual({ ok: true, ai: false, credentials: false });

		const full = await setup({ ai: { generate: vi.fn(), edit: vi.fn(), explain: vi.fn() } as never });
		expect((await full.call('GET', '/api/health')).body).toEqual({ ok: true, ai: true, credentials: true });
	});

	it('passes prompts to the service and returns the flow it built', async () => {
		const ai = {
			generate: vi.fn(async () => ({ ok: true, flow: waitingFlow, issues: [], model: 'fake', attempts: 2 })),
			edit: vi.fn(async () => ({ ok: true, flow: waitingFlow, issues: [], changes: [{ type: 'step:added', id: 'wait' }] })),
			explain: vi.fn(async () => ({ text: 'It waits two hours, then finishes.', model: 'fake' }))
		};
		const { call } = await setup({ ai });

		const generated = await call('POST', '/api/ai/generate', { prompt: 'wait two hours', vars: { hours: 2 } });
		expect(generated.status).toBe(200);
		expect(generated.body).toMatchObject({ ok: true, model: 'fake', attempts: 2 });
		expect(generated.body.flow.name).toBe(waitingFlow.name);
		expect(ai.generate).toHaveBeenCalledWith({ prompt: 'wait two hours', vars: { hours: 2 } });

		expect((await call('POST', '/api/ai/generate', {})).status).toBe(400);

		const edited = await call('POST', '/api/ai/edit', { flow: waitingFlow, instruction: 'wait three hours instead' });
		expect(edited.body.changes).toEqual([{ type: 'step:added', id: 'wait' }]);
		expect(ai.edit).toHaveBeenCalledWith({ flow: expect.objectContaining({ name: waitingFlow.name }), instruction: 'wait three hours instead' });

		expect((await call('POST', '/api/ai/edit', { instruction: 'no flow here' })).status).toBe(422);

		const explained = await call('POST', '/api/ai/explain', { flow: waitingFlow, question: 'How long does it wait?' });
		expect(explained.body.text).toContain('waits two hours');
		expect(ai.explain).toHaveBeenCalledWith({ flow: expect.objectContaining({ name: waitingFlow.name }), question: 'How long does it wait?' });
		expect((await call('POST', '/api/ai/explain', {})).status).toBe(422);
	});
});

describe('run variables', () => {
	it('takes vars for one run without touching the saved flow', async () => {
		const { call } = await setup();
		const flow = build('Uses a variable', (f) => {
			f.add('trigger.manual', {}, { id: 'start' }).to(
				f.add('data.set', { fields: [{ name: 'limit', value: '{{ vars.limit }}' }], keepInput: false }, { id: 'set' })
			);
		});
		await call('POST', '/api/flows', { id: 'vars', flow: { ...flow, vars: { limit: 'from the flow' } } });

		const run = await call('POST', '/api/flows/vars/runs', { wait: true, vars: { limit: 'from the caller' } });
		expect(run.body.run.state.steps.set.output).toEqual({ limit: 'from the caller' });
		expect(run.body.run.state.vars.limit).toBe('from the caller');

		// The flow on the server still has its own, so the next run is unaffected.
		const saved = await call('GET', '/api/flows/vars');
		expect(saved.body.flow.flow.vars).toEqual({ limit: 'from the flow' });
		const plain = await call('POST', '/api/flows/vars/runs', { wait: true });
		expect(plain.body.run.state.steps.set.output).toEqual({ limit: 'from the flow' });
	});
});

describe('unknown routes', () => {
	it('answers JSON under /api and /hooks, whatever the method', async () => {
		const { call } = await setup();
		for (const [method, path] of [
			['GET', '/api/nope'],
			['PATCH', '/api/flows/draft'],
			['GET', '/api/flows/draft/nope'],
			['POST', '/hooks']
		] as const) {
			const response = await call(method, path);
			expect(response.status).toBe(404);
			expect(response.headers.get('content-type')).toContain('application/json');
			expect(typeof response.body.error).toBe('string');
		}

		// Ids that do not exist keep answering JSON too.
		const missing = await call('GET', '/api/flows/ghost');
		expect(missing.status).toBe(404);
		expect(missing.body.error).toContain('ghost');
		expect((await call('GET', '/api/runs/ghost')).body.error).toContain('ghost');
		expect((await call('POST', '/hooks/nothing/here')).body.error).toContain('No active flow');
	});
});

describe('webhooks', () => {
	const hookFlow = (respond: 'immediately' | 'when-finished' | 'respond-step') =>
		build(`Hook ${respond}`, (f) => {
			const hook = f.add('trigger.webhook', { path: 'orders/created', respond }, { id: 'hook' });
			const shape = f.add('data.set', { fields: [{ name: 'orderId', value: '{{ trigger.body.id }}' }], keepInput: false }, { id: 'shape' });
			hook.to(shape);
			if (respond === 'respond-step') shape.to(f.add('http.respond', { status: 201, body: { accepted: '{{ input.orderId }}' } }, { id: 'reply' }));
		});

	it('only answers for active flows', async () => {
		const { call } = await setup();
		await call('POST', '/api/flows', { id: 'hook', flow: hookFlow('immediately') });
		expect((await call('POST', '/hooks/orders/created', { id: 1 })).status).toBe(404);

		await call('PUT', '/api/flows/hook', { flow: hookFlow('immediately'), active: true });
		const accepted = await call('POST', '/hooks/orders/created', { id: 1 });
		expect(accepted.status).toBe(202);
		expect(accepted.body.runId).toBeTruthy();
		expect((await call('GET', '/hooks/orders/created')).status).toBe(404);
	});

	it('responds with the result when the flow finishes', async () => {
		const { call } = await setup();
		await call('POST', '/api/flows', { id: 'hook', flow: hookFlow('when-finished'), active: true });
		const response = await call('POST', '/hooks/orders/created', { id: 42 });
		expect(response.status).toBe(200);
		expect(response.body).toMatchObject({ status: 'completed', output: { orderId: 42 } });
	});

	it('responds from a Respond to webhook step', async () => {
		const { call } = await setup();
		await call('POST', '/api/flows', { id: 'hook', flow: hookFlow('respond-step'), active: true });
		const response = await call('POST', '/hooks/orders/created', { id: 7 });
		expect(response.status).toBe(201);
		expect(response.body).toEqual({ accepted: 7 });
	});
});

describe('credentials', () => {
	it('stores secrets encrypted and hands them only to steps', async () => {
		const fetchMock = vi.fn(async () => new Response('{"ok":true}', { headers: { 'content-type': 'application/json' } }));
		vi.stubGlobal('fetch', fetchMock);
		const { server, call } = await setup();

		const created = await call('POST', '/api/credentials', { id: 'crm', name: 'CRM token', type: 'http-auth', value: { type: 'bearer', token: 's3cret-token' } });
		expect(created.status).toBe(201);
		expect(JSON.stringify(created.body)).not.toContain('s3cret');
		expect(JSON.stringify(await server.storage.getCredential('crm'))).not.toContain('s3cret');

		const flow = build('Call CRM', (f) => f.add('trigger.manual', {}, { id: 'start' }).to(f.add('http.request', { url: 'https://crm.example.com/me', auth: 'crm' }, { id: 'me' })));
		await call('POST', '/api/flows', { id: 'crm', flow });
		const run = await call('POST', '/api/flows/crm/runs', { wait: true });
		expect(run.body.run.status).toBe('completed');
		expect(new Headers((fetchMock.mock.calls[0] as unknown as [URL, RequestInit])[1].headers).get('authorization')).toBe('Bearer s3cret-token');
		expect(JSON.stringify((await call('GET', `/api/runs/${run.body.run.id}`)).body)).not.toContain('s3cret');
	});

	it('refuses credentials without a server secret', async () => {
		const { call } = await setup({ secret: undefined });
		expect((await call('POST', '/api/credentials', { name: 'x', type: 'http-auth', value: 1 })).status).toBe(503);
	});
});

describe('scheduler', () => {
	it('starts runs on cron schedules', async () => {
		let clock = Date.parse('2026-09-16T10:01:00Z');
		const { server, call } = await setup({ now: () => clock });
		const flow = build('Every five minutes', (f) =>
			f.add('trigger.schedule', { cron: '*/5 * * * *', timezone: 'UTC' }, { id: 'tick' }).to(f.add('data.set', { fields: [{ name: 'ran', value: true }] }, { id: 'mark' }))
		);
		await call('POST', '/api/flows', { id: 'cron', flow, active: true });

		expect((await server.scheduler.tick()).started).toEqual([]);
		expect(server.scheduler.planned()).toEqual({ 'cron@1/tick': Date.parse('2026-09-16T10:05:00Z') });

		clock = Date.parse('2026-09-16T10:05:01Z');
		const tick = await server.scheduler.tick();
		expect(tick.started).toHaveLength(1);
		const [run] = await tick.finished;
		expect(run).toMatchObject({ status: 'completed', trigger: { type: 'schedule', nodeId: 'tick' } });
		expect(run.state.steps.mark.output).toMatchObject({ scheduledAt: '2026-09-16T10:05:00.000Z', ran: true });
	});

	it('resumes due timers after a restart', async () => {
		const file = join(mkdtempSync(join(tmpdir(), 'arcflow-')), 'arcflow.db');

		const before = await setup({ storage: new SqliteStorage(file) });
		await before.call('POST', '/api/flows', { id: 'waiter', flow: waitingFlow });
		const started = await before.call('POST', '/api/flows/waiter/runs', { wait: true });
		expect(started.body.run.status).toBe('waiting');

		// A new process with the same database, three hours later.
		const later = Date.now() + 3 * 3_600_000;
		const after = await setup({ storage: new SqliteStorage(file), now: () => later });
		await after.server.start();
		const tick = await after.server.scheduler.tick();
		await after.server.stop();

		expect(tick.resumed).toEqual([started.body.run.id]);
		const [run] = await tick.finished;
		expect(run.status).toBe('completed');
		expect((await after.call('GET', `/api/runs/${run.id}`)).body.result).toEqual({ done: true });
	});

	it('fails runs that were interrupted mid-step', async () => {
		const storage = new SqliteStorage(join(mkdtempSync(join(tmpdir(), 'arcflow-')), 'arcflow.db'));
		const { server } = await setup({ storage });
		const handle = await server.runs.start({ id: 'waiter', name: 'x', flow: waitingFlow, active: false, version: 1, createdAt: 0, updatedAt: 0 }, { trigger: { type: 'api' } });
		await handle.finished;
		const stored = (await storage.getRun(handle.run.id))!;
		await storage.saveRun({ ...stored, status: 'running', state: { ...stored.state, status: 'running' } });

		const restarted = await setup({ storage });
		await restarted.server.start();
		await restarted.server.stop();
		expect((await storage.getRun(handle.run.id))?.state.error?.message).toMatch(/server stopped/);
	});
});
