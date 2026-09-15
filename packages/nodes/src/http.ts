import { defineNode, f, type InferShape, type NodeContext } from '@arcflow/core';
import { isRecord } from './util.js';

export interface HttpResponseData {
	status: number;
	headers: Record<string, string>;
	body: unknown;
}

declare module '@arcflow/core' {
	interface Services {
		/** Sends the response for the webhook call that started a run. Provided by the HTTP server. */
		http?: { respond(response: HttpResponseData & { runId: string }): void | Promise<void> };
	}
}

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'] as const;
const pair = { name: f.string({ placeholder: 'Name' }), value: f.string({ placeholder: 'Value' }) };

const requestConfig = {
	method: f.enum(METHODS, { default: 'GET' }),
	url: f.string({ label: 'URL', placeholder: 'https://api.example.com/items', mono: true }),
	query: f.list(pair, { optional: true, label: 'Query parameters' }),
	headers: f.list(pair, { optional: true }),
	body: f.json({
		optional: true,
		when: { field: 'method', equals: ['POST', 'PUT', 'PATCH', 'DELETE'] },
		description: 'Objects and lists are sent as JSON; text is sent as-is.'
	}),
	auth: f.credential('http-auth', {
		optional: true,
		label: 'Authentication',
		description: 'Resolves to { type: "bearer", token }, { type: "basic", username, password } or { type: "header", name, value }.'
	}),
	response: f.enum(['auto', 'json', 'text'], { default: 'auto', label: 'Read response as' }),
	timeoutMs: f.number({ integer: true, min: 1, default: 30_000, label: 'Timeout', unit: 'ms' }),
	failOnError: f.boolean({ default: true, label: 'Fail on 4xx and 5xx responses' })
};

type RequestContext = NodeContext<InferShape<typeof requestConfig>>;

function applyAuth(headers: Headers, secret: unknown) {
	if (secret === undefined) return;
	if (!isRecord(secret)) throw new Error('The http-auth credential must resolve to an object.');
	switch (secret.type) {
		case 'bearer':
			headers.set('authorization', `Bearer ${String(secret.token ?? '')}`);
			return;
		case 'basic':
			headers.set('authorization', `Basic ${btoa(`${String(secret.username ?? '')}:${String(secret.password ?? '')}`)}`);
			return;
		case 'header':
			headers.set(String(secret.name), String(secret.value ?? ''));
			return;
		default:
			throw new Error(`Unsupported http-auth type "${String(secret.type)}".`);
	}
}

async function sendRequest(ctx: RequestContext) {
	const { method, query = [], headers: headerList = [], body, response: mode, timeoutMs, failOnError } = ctx.config;

	let url: URL;
	try {
		url = new URL(ctx.config.url);
	} catch {
		throw new Error(`"${ctx.config.url}" is not a valid URL.`);
	}
	if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Only http and https URLs are allowed.');
	for (const { name, value } of query) url.searchParams.append(name, value);

	const headers = new Headers();
	for (const { name, value } of headerList) headers.set(name, value);
	applyAuth(headers, ctx.secrets.auth);

	let payload: string | undefined;
	if (body !== undefined && method !== 'GET' && method !== 'HEAD') {
		if (typeof body === 'string') {
			payload = body;
		} else {
			payload = JSON.stringify(body);
			if (!headers.has('content-type')) headers.set('content-type', 'application/json');
		}
	}

	let response: Response;
	try {
		response = await fetch(url, { method, headers, body: payload, signal: AbortSignal.any([ctx.signal, AbortSignal.timeout(timeoutMs)]) });
	} catch (error) {
		if (ctx.signal.aborted) throw error;
		if (error instanceof DOMException && error.name === 'TimeoutError') throw new Error(`${method} ${url.host} timed out after ${timeoutMs} ms.`);
		throw new Error(`${method} ${url.href} failed: ${error instanceof Error ? error.message : String(error)}`);
	}

	const text = method === 'HEAD' ? '' : await response.text();
	let data: unknown = text;
	if (mode === 'json' || (mode === 'auto' && /[/+]json\b/i.test(response.headers.get('content-type') ?? ''))) {
		try {
			data = text ? JSON.parse(text) : null;
		} catch {
			if (mode === 'json') throw new Error(`The response from ${url.host} is not valid JSON.`);
		}
	}

	const output = { status: response.status, ok: response.ok, headers: Object.fromEntries(response.headers), body: data };
	if (!response.ok && failOnError) {
		throw new Error(`${method} ${url.host}${url.pathname} returned ${response.status}${response.statusText ? ` ${response.statusText}` : ''}.`);
	}
	return { port: 'out' as const, output, message: `${response.status} from ${url.host}` };
}

export const httpRequest = defineNode({
	kind: 'http.request',
	title: 'HTTP request',
	description: 'Calls a URL and outputs { status, ok, headers, body }. In test runs only GET and HEAD requests are sent.',
	category: 'http',
	icon: 'globe',
	outputs: [{ id: 'out' }, { id: 'error', label: 'Error' }],
	config: requestConfig,
	summary: (c) => (c.url ? `${c.method} ${String(c.url).replace(/^https?:\/\//, '')}` : `${c.method} — no URL yet`),
	run: sendRequest,
	simulate: (ctx) =>
		ctx.config.method === 'GET' || ctx.config.method === 'HEAD'
			? sendRequest(ctx)
			: {
					port: 'out',
					output: { status: 200, ok: true, headers: {}, body: null, simulated: true },
					message: `Would send ${ctx.config.method} ${ctx.config.url}`
				}
});

const respondConfig = {
	status: f.number({ integer: true, min: 100, max: 599, default: 200 }),
	headers: f.list(pair, { optional: true }),
	body: f.json({ optional: true })
};

const responseOf = (config: InferShape<typeof respondConfig>): HttpResponseData => ({
	status: config.status,
	headers: Object.fromEntries((config.headers ?? []).map(({ name, value }) => [name.toLowerCase(), value])),
	body: config.body ?? null
});

export const httpRespond = defineNode({
	kind: 'http.respond',
	title: 'Respond to webhook',
	description: 'Sends the HTTP response to the webhook call that started this run. The webhook must be set to respond from this step.',
	category: 'http',
	icon: 'reply',
	config: respondConfig,
	summary: (c) => `Responds ${c.status}`,
	run: async (ctx) => {
		const response = responseOf(ctx.config);
		await ctx.services.http?.respond({ runId: ctx.runId, ...response });
		return { output: response };
	},
	simulate: (ctx) => ({ output: responseOf(ctx.config), message: `Would respond ${ctx.config.status}` })
});
