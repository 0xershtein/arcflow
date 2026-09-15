import { Hono, type Context } from 'hono';
import { bearerAuth } from 'hono/bearer-auth';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import { streamSSE } from 'hono/streaming';
import { FlowError, hasErrors, shapeSchema, toManifest, type AnyNodeDefinition, type Registry, type RunEvent } from '@arcflow/core';
import type { HttpResponseData } from '@arcflow/nodes';
import type { FlowAiService } from './ai.js';
import { HttpError, badRequest, conflict, notFound } from './errors.js';
import { runResult, type RunManager } from './runs.js';
import type { SecretBox } from './secrets.js';
import type { CredentialRecord, FlowRecord, RunRecord, Storage } from './types.js';

export interface AppContext {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	registry: Registry<any>;
	storage: Storage;
	runs: RunManager;
	box?: SecretBox;
	/** Pending "Respond to webhook" responses by run id. */
	responders: Map<string, (response: HttpResponseData) => void>;
	now: () => number;
	apiKey?: string;
	cors?: string | string[];
	webhookTimeoutMs: number;
	/** Flow generation. Without it, `/api/ai/*` answers 501. */
	ai?: FlowAiService;
}

const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
	new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...headers } });

const slugify = (name: string) =>
	name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 48) || 'flow';

async function readJson(c: Context, optional = false): Promise<Record<string, unknown>> {
	const text = await c.req.text();
	if (!text.trim()) {
		if (optional) return {};
		throw badRequest('Request body is required.');
	}
	try {
		const value = JSON.parse(text);
		if (!isRecord(value)) throw new Error();
		return value;
	} catch {
		throw badRequest('Request body must be a JSON object.');
	}
}

const runSummary = (run: RunRecord) => ({
	id: run.id,
	flowId: run.flowId,
	flowVersion: run.flowVersion,
	status: run.status,
	trigger: run.trigger,
	startedAt: run.startedAt,
	updatedAt: run.updatedAt,
	...(run.finishedAt !== undefined ? { finishedAt: run.finishedAt } : {}),
	...(run.wakeAt !== undefined ? { wakeAt: run.wakeAt } : {}),
	...(run.state.error ? { error: run.state.error.message } : {})
});

const credentialSummary = ({ secret: _secret, ...rest }: CredentialRecord) => rest;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | 'timeout'> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	return Promise.race([promise, new Promise<'timeout'>((resolve) => (timer = setTimeout(() => resolve('timeout'), ms)))]).finally(() =>
		clearTimeout(timer)
	);
}

/** Builds the HTTP API (`/api/*`) and webhook endpoints (`/hooks/*`). */
export function createApp(ctx: AppContext) {
	const { registry, storage, runs, now } = ctx;
	const app = new Hono();

	const flowSummary = (record: FlowRecord) => ({
		id: record.id,
		name: record.name,
		active: record.active,
		version: record.version,
		createdAt: record.createdAt,
		updatedAt: record.updatedAt,
		triggers: record.flow.nodes.filter((node) => registry.get(node.kind)?.trigger).map((node) => ({ id: node.id, kind: node.kind }))
	});

	if (ctx.cors) app.use('/api/*', cors({ origin: ctx.cors }));
	if (ctx.apiKey) app.use('/api/*', bearerAuth({ token: ctx.apiKey }));

	app.onError((error, c) => {
		if (error instanceof HttpError) return json({ error: error.message, ...error.details }, error.status);
		if (error instanceof FlowError) return json({ error: error.message.split('\n')[0], issues: error.issues }, 422);
		if (error instanceof HTTPException) return error.getResponse();
		console.error('[arcflow]', c.req.method, c.req.path, error);
		return json({ error: 'Internal server error.' }, 500);
	});

	app.get('/api/health', () => json({ ok: true }));

	// ---------- Steps ----------

	app.get('/api/steps', () =>
		json({
			categories: registry.categories,
			steps: (registry.nodes as readonly AnyNodeDefinition[]).map((def) => ({
				kind: def.kind,
				title: def.title,
				description: def.description,
				category: def.category ?? 'other',
				icon: def.icon,
				trigger: Boolean(def.trigger),
				loop: Boolean(def.loop),
				join: def.join ?? 'any',
				outputs: def.outputs,
				config: shapeSchema(def.config)
			})),
			schema: registry.toJSONSchema(),
			catalog: registry.describe(),
			// Everything a browser editor needs to show and validate flows, minus the code.
			manifest: toManifest(registry)
		})
	);

	// ---------- Flows ----------

	app.post('/api/flows/validate', async (c) => {
		const body = await readJson(c);
		const result = registry.parse(isRecord(body.flow) ? body.flow : body);
		return json({ ok: result.ok, issues: result.issues, flow: result.flow });
	});

	app.get('/api/flows', async () => json({ flows: (await storage.listFlows()).map(flowSummary) }));

	async function saveFlow(c: Context, pathId?: string) {
		const body = await readJson(c);
		const wrapped = isRecord(body.flow);
		const parsed = registry.parse(wrapped ? body.flow : body);
		if (!parsed.flow) throw new HttpError(422, 'The body is not a flow.', { issues: parsed.issues });

		const existing = pathId ? await storage.getFlow(pathId) : undefined;
		const id = pathId ?? (wrapped && typeof body.id === 'string' ? body.id : `${slugify(parsed.flow.name)}-${crypto.randomUUID().slice(0, 6)}`);
		if (!ID.test(id)) throw badRequest('Flow ids use letters, digits, "-" or "_" (up to 64 characters).');
		if (!pathId && (await storage.getFlow(id))) throw conflict(`A flow with id "${id}" already exists.`);

		const active = wrapped && typeof body.active === 'boolean' ? body.active : (existing?.active ?? false);
		if (active && hasErrors(parsed.issues)) {
			throw new HttpError(422, "Fix the flow's errors before activating it.", { issues: parsed.issues });
		}
		const at = now();
		const record: FlowRecord = {
			id,
			name: parsed.flow.name,
			flow: parsed.flow,
			active,
			version: (existing?.version ?? 0) + 1,
			createdAt: existing?.createdAt ?? at,
			updatedAt: at
		};
		await storage.saveFlow(record);
		return json({ flow: record, issues: parsed.issues }, existing ? 200 : 201);
	}

	app.post('/api/flows', (c) => saveFlow(c));
	app.put('/api/flows/:id', (c) => saveFlow(c, c.req.param('id')));

	app.get('/api/flows/:id', async (c) => {
		const record = await storage.getFlow(c.req.param('id'));
		if (!record) throw notFound(`Flow "${c.req.param('id')}" does not exist.`);
		return json({ flow: record, issues: registry.validate(record.flow) });
	});

	app.delete('/api/flows/:id', async (c) => {
		await storage.deleteFlow(c.req.param('id'));
		return new Response(null, { status: 204 });
	});

	app.post('/api/flows/:id/runs', async (c) => {
		const record = await storage.getFlow(c.req.param('id'));
		if (!record) throw notFound(`Flow "${c.req.param('id')}" does not exist.`);
		const body = await readJson(c, true);
		const handle = await runs.start(record, {
			trigger: { type: 'api' },
			payload: body.payload,
			mode: body.mode === 'simulate' ? 'simulate' : 'live',
			triggerNode: typeof body.trigger === 'string' ? body.trigger : undefined
		});
		if (body.wait === true) return json({ run: await handle.finished });
		return json({ run: runSummary(handle.run) }, 202);
	});

	// ---------- Runs ----------

	app.get('/api/runs', async (c) => {
		const query = c.req.query();
		const runsList = await storage.listRuns({
			flowId: query.flowId || undefined,
			status: (query.status as RunRecord['status']) || undefined,
			before: query.before ? Number(query.before) : undefined,
			limit: Math.min(200, Number(query.limit) || 50)
		});
		return json({ runs: runsList.map(runSummary) });
	});

	app.get('/api/runs/:id', async (c) => {
		const run = await storage.getRun(c.req.param('id'));
		if (!run) throw notFound(`Run "${c.req.param('id')}" does not exist.`);
		return json({ run, result: runResult(run.state) });
	});

	app.post('/api/runs/:id/resume', async (c) => {
		const body = await readJson(c);
		if (typeof body.nodeId !== 'string') throw badRequest('"nodeId" is required: the key of the waiting step.');
		const handle = await runs.resume(c.req.param('id'), {
			nodeId: body.nodeId,
			...(body.data !== undefined ? { data: body.data } : {}),
			...(typeof body.port === 'string' ? { port: body.port } : {}),
			...(body.output !== undefined ? { output: body.output } : {})
		});
		if (body.wait === true) return json({ run: await handle.finished });
		return json({ run: runSummary(handle.run) }, 202);
	});

	app.post('/api/runs/:id/cancel', async (c) => {
		await runs.cancel(c.req.param('id'));
		return json({ ok: true });
	});

	app.get('/api/runs/:id/events', async (c) => {
		const id = c.req.param('id');
		const stored = await storage.getRun(id);
		if (!stored) throw notFound(`Run "${id}" does not exist.`);

		return streamSSE(c, async (stream) => {
			// Writes are chained so events keep their order and the stream only closes after the last one is out.
			let writing = Promise.resolve();
			const send = (event: RunEvent) => (writing = writing.then(() => stream.writeSSE({ event: event.type, data: JSON.stringify(event) })));

			await new Promise<void>((resolve) => {
				const unsubscribe = runs.subscribe(id, (event) => {
					send(event);
					if (event.type === 'run:end') {
						unsubscribe();
						void writing.then(resolve);
					}
				});
				stream.onAbort(() => {
					unsubscribe();
					resolve();
				});
				if (!runs.isActive(id)) {
					unsubscribe();
					void storage
						.getRun(id)
						.then((latest) => send({ type: 'run:end', runId: id, status: latest?.status ?? stored.status, at: latest?.updatedAt ?? stored.updatedAt }))
						.then(resolve);
				}
			});
		});
	});

	// ---------- Credentials ----------

	const requireBox = () => {
		if (!ctx.box) throw new HttpError(503, 'Credentials are disabled: start the server with a secret (ARCFLOW_SECRET).');
		return ctx.box;
	};

	app.get('/api/credentials', async () => json({ credentials: (await storage.listCredentials()).map(credentialSummary) }));

	app.post('/api/credentials', async (c) => {
		const box = requireBox();
		const body = await readJson(c);
		if (typeof body.name !== 'string' || !body.name.trim()) throw badRequest('"name" is required.');
		if (typeof body.type !== 'string' || !body.type.trim()) throw badRequest('"type" is required, e.g. "http-auth".');
		if (body.value === undefined) throw badRequest('"value" is required.');
		const id = typeof body.id === 'string' ? body.id : `${slugify(body.name)}-${crypto.randomUUID().slice(0, 6)}`;
		if (!ID.test(id)) throw badRequest('Credential ids use letters, digits, "-" or "_".');
		if (await storage.getCredential(id)) throw conflict(`A credential with id "${id}" already exists.`);
		const at = now();
		const record: CredentialRecord = { id, name: body.name.trim(), type: body.type.trim(), secret: await box.seal(body.value), createdAt: at, updatedAt: at };
		await storage.saveCredential(record);
		return json({ credential: credentialSummary(record) }, 201);
	});

	app.put('/api/credentials/:id', async (c) => {
		const box = requireBox();
		const existing = await storage.getCredential(c.req.param('id'));
		if (!existing) throw notFound(`Credential "${c.req.param('id')}" does not exist.`);
		const body = await readJson(c);
		const record: CredentialRecord = {
			...existing,
			name: typeof body.name === 'string' && body.name.trim() ? body.name.trim() : existing.name,
			secret: body.value !== undefined ? await box.seal(body.value) : existing.secret,
			updatedAt: now()
		};
		await storage.saveCredential(record);
		return json({ credential: credentialSummary(record) });
	});

	app.delete('/api/credentials/:id', async (c) => {
		await storage.deleteCredential(c.req.param('id'));
		return new Response(null, { status: 204 });
	});

	// ---------- Flow generation ----------

	const requireAi = () => {
		if (!ctx.ai) throw new HttpError(501, 'Flow generation is off: start the server with a model (ANTHROPIC_API_KEY).');
		return ctx.ai;
	};

	app.post('/api/ai/generate', async (c) => {
		const ai = requireAi();
		const body = await readJson(c);
		if (typeof body.prompt !== 'string' || !body.prompt.trim()) throw badRequest('"prompt" is required: what the flow should do.');
		return json(await ai.generate({ prompt: body.prompt, ...(isRecord(body.vars) ? { vars: body.vars } : {}) }));
	});

	app.post('/api/ai/edit', async (c) => {
		const ai = requireAi();
		const body = await readJson(c);
		if (typeof body.instruction !== 'string' || !body.instruction.trim()) throw badRequest('"instruction" is required: what to change.');
		const parsed = registry.parse(body.flow);
		if (!parsed.flow) throw new HttpError(422, 'The body has no flow to edit.', { issues: parsed.issues });
		return json(await ai.edit({ flow: parsed.flow, instruction: body.instruction }));
	});

	// ---------- Webhooks ----------

	app.all('/hooks/*', async (c) => {
		const path = decodeURIComponent(c.req.path.slice('/hooks/'.length)).replace(/\/+$/, '');
		const method = c.req.method.toUpperCase();
		const matches = (await storage.listFlows()).flatMap((record) =>
			record.active
				? record.flow.nodes
						.filter((node) => node.kind === 'trigger.webhook' && !node.disabled && node.config.path === path && (node.config.method ?? 'POST') === method)
						.map((node) => ({ record, node }))
				: []
		);
		if (matches.length === 0) return json({ error: `No active flow handles ${method} /hooks/${path}.` }, 404);

		const text = await c.req.text();
		let body: unknown = text || null;
		if (text && /json/i.test(c.req.header('content-type') ?? '')) {
			try {
				body = JSON.parse(text);
			} catch {
				return json({ error: 'Invalid JSON body.' }, 400);
			}
		}
		const payload = { method, path, headers: Object.fromEntries(c.req.raw.headers), query: c.req.query(), body };

		const handles = [];
		let responded: Promise<HttpResponseData> | undefined;
		for (const [index, { record, node }] of matches.entries()) {
			const mode = index === 0 ? String(node.config.respond ?? 'immediately') : 'immediately';
			let resolveResponse: ((response: HttpResponseData) => void) | undefined;
			if (mode === 'respond-step') responded = new Promise((resolve) => (resolveResponse = resolve));
			const handle = await runs.start(record, {
				trigger: { type: 'webhook', method, path },
				triggerNode: node.id,
				payload,
				onCreated: (runId) => {
					if (resolveResponse) ctx.responders.set(runId, resolveResponse);
				}
			});
			handle.finished.finally(() => ctx.responders.delete(handle.run.id)).catch(() => {});
			handles.push({ handle, mode });
		}

		const [{ handle, mode }] = handles;
		if (mode === 'immediately') return json({ runId: handle.run.id, status: handle.run.status }, 202);

		const outcome = await withTimeout(
			mode === 'respond-step'
				? Promise.race([responded!, handle.finished.then((run) => ({ run }))])
				: handle.finished.then((run) => ({ run })),
			ctx.webhookTimeoutMs
		);
		if (outcome === 'timeout') return json({ runId: handle.run.id, status: 'running' }, 202);
		if ('status' in outcome && typeof outcome.status === 'number') {
			const response = outcome as HttpResponseData;
			const isText = typeof response.body === 'string';
			return new Response(isText ? (response.body as string) : JSON.stringify(response.body), {
				status: response.status,
				headers: { 'content-type': isText ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8', ...response.headers }
			});
		}
		const run = (outcome as { run: RunRecord }).run;
		if (run.status === 'failed') return json({ runId: run.id, status: run.status, error: run.state.error?.message }, 500);
		return json({ runId: run.id, status: run.status, output: runResult(run.state) }, run.status === 'completed' ? 200 : 202);
	});

	return app;
}
