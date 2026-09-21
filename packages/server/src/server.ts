import type { EngineOptions, Registry, Services } from '@arcsig-labs/core';
import type { HttpResponseData } from '@arcsig-labs/nodes';
import type { FlowAiService } from './ai.js';
import { createApp } from './app.js';
import { RunManager } from './runs.js';
import { Scheduler } from './scheduler.js';
import { createSecretBox } from './secrets.js';
import { MemoryStorage } from './storage/memory.js';
import type { Storage } from './types.js';

export interface ServerOptions {
	/** Step types flows may use. */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	registry: Registry<any>;
	/** Defaults to in-memory storage. Use `SqliteStorage` from `@arcsig-labs/server/node` to keep data. */
	storage?: Storage;
	/** Encrypts stored credentials. Without it, credential endpoints are disabled. At least 16 characters. */
	secret?: string;
	/** Your own services for steps (payments, email, …). `credentials` and `http` are provided by the server. */
	services?: Services;
	/** Require `Authorization: Bearer <apiKey>` on `/api/*`. Webhooks stay open. */
	apiKey?: string;
	/** Allowed origins for browser access to `/api/*`. */
	cors?: string | string[];
	/** How long webhooks that respond with a result wait before answering 202. Default 30 000 ms. */
	webhookTimeoutMs?: number;
	/** Scheduler interval. Default 1000 ms. */
	schedulerIntervalMs?: number;
	/** Flow generation for `/api/ai/*`, e.g. `createFlowAi({ registry })`. */
	ai?: FlowAiService;
	engine?: Pick<EngineOptions, 'maxOutputBytes' | 'maxDepth'>;
	now?: () => number;
	onError?: (error: unknown) => void;
}

export type ArcflowServer = Awaited<ReturnType<typeof createServer>>;

/**
 * Creates the server: a Hono app (`app` / `fetch`) plus the run manager and scheduler behind it.
 * Call `start()` to recover interrupted runs and begin scheduling; serve `fetch` with any runtime.
 */
export async function createServer(options: ServerOptions) {
	const storage = options.storage ?? new MemoryStorage();
	const now = options.now ?? Date.now;
	const onError = options.onError ?? ((error: unknown) => console.error('[arcflow]', error));
	const box = options.secret ? await createSecretBox(options.secret) : undefined;
	const responders = new Map<string, (response: HttpResponseData) => void>();

	const services: Services = {
		...options.services,
		credentials: {
			resolve: async ({ id, type }) => {
				if (!box) throw new Error('Credentials need a server secret (ARCFLOW_SECRET).');
				const record = await storage.getCredential(id);
				if (!record) throw new Error(`Credential "${id}" does not exist.`);
				if (record.type !== type) throw new Error(`Credential "${id}" is a "${record.type}" credential, but this step needs "${type}".`);
				return box.open(record.secret);
			}
		},
		http: {
			respond: (response) => {
				const { runId, ...rest } = response;
				responders.get(runId)?.(rest);
			}
		}
	};

	const runs = new RunManager(
		options.registry,
		storage,
		{ ...options.engine, services, now, flows: { get: async (id) => (await storage.getFlow(id))?.flow } },
		now
	);
	const scheduler = new Scheduler({ storage, runs, now, intervalMs: options.schedulerIntervalMs, onError });
	const app = createApp({
		registry: options.registry,
		storage,
		runs,
		box,
		responders,
		now,
		apiKey: options.apiKey,
		cors: options.cors,
		webhookTimeoutMs: options.webhookTimeoutMs ?? 30_000,
		...(options.ai ? { ai: options.ai } : {})
	});

	return {
		app,
		fetch: (request: Request) => app.fetch(request),
		storage,
		runs,
		scheduler,
		/** Marks runs interrupted by a previous shutdown as failed, then starts the scheduler. */
		async start() {
			await runs.recover();
			scheduler.start();
		},
		async stop() {
			scheduler.stop();
		}
	};
}
