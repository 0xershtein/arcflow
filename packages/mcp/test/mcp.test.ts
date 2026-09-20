import { describe, expect, it, vi } from 'vitest';
import { createRegistry, defineNode, f, type Flow, type RunState } from '@arcflow/core';
import { createMcpServer, type FlowStore, type JsonRpcResponse } from '../src/index.js';

const start = defineNode({
	kind: 'test.start',
	title: 'Start',
	description: 'Starts the flow.',
	trigger: true,
	category: 'triggers',
	run: (ctx) => ({ output: ctx.input ?? { ok: true } })
});
const notify = defineNode({
	kind: 'test.notify',
	title: 'Notify',
	description: 'Sends a message.',
	config: { to: f.string(), message: f.text() },
	simulate: (ctx) => ({ output: { sent: ctx.config.to }, message: `Would tell ${ctx.config.to}` })
});
const registry = createRegistry([start, notify]);

const flow: Flow = {
	version: 1,
	name: 'Tell the team',
	nodes: [
		{ id: 'start', kind: 'test.start', config: {} },
		{ id: 'tell', kind: 'test.notify', config: { to: 'team@example.com', message: 'hi' } }
	],
	edges: [{ id: 'start:out->tell', from: 'start', port: 'out', to: 'tell' }]
};

/** Missing a required setting — an error, unlike a step that is merely disconnected. */
const brokenFlow: Flow = { ...flow, nodes: [flow.nodes[0], { id: 'tell', kind: 'test.notify', config: { message: 'hi' } }] };

const call = (name: string, args: Record<string, unknown> = {}) => ({ jsonrpc: '2.0' as const, id: 1, method: 'tools/call', params: { name, arguments: args } });

/** The text a tool result carries. */
const textOf = (response: JsonRpcResponse | null) => (response?.result as { content: { text: string }[] }).content[0].text;
const dataOf = <T>(response: JsonRpcResponse | null) => (response?.result as { structuredContent?: { result: T } }).structuredContent?.result;
const isError = (response: JsonRpcResponse | null) => Boolean((response?.result as { isError?: boolean }).isError);

describe('protocol', () => {
	const server = createMcpServer({ registry });

	it('answers initialize with the client protocol version and its own info', async () => {
		const response = await server.handle({ jsonrpc: '2.0', id: 0, method: 'initialize', params: { protocolVersion: '2025-03-26' } });
		expect(response?.result).toMatchObject({
			protocolVersion: '2025-03-26',
			capabilities: { tools: { listChanged: false } },
			serverInfo: { name: 'arcflow' }
		});
		expect((response?.result as { instructions: string }).instructions).toContain('list_steps');
	});

	it('stays quiet for notifications and reports unknown methods', async () => {
		expect(await server.handle({ jsonrpc: '2.0', method: 'notifications/initialized' })).toBeNull();
		const unknown = await server.handle({ jsonrpc: '2.0', id: 3, method: 'resources/list' });
		expect(unknown?.error).toMatchObject({ code: -32601 });
		const bad = await server.handle({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'nope' } });
		expect(bad?.error?.message).toContain('nope');
	});

	it('reads newline-delimited messages and writes one answer per request', async () => {
		const written: string[] = [];
		const input = (async function* () {
			yield `${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' })}\n`;
			yield `${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n{ not json }\n`;
		})();
		await server.serve(input, { write: (chunk) => written.push(chunk) });
		const answers = written.map((line) => JSON.parse(line) as JsonRpcResponse);
		expect(answers).toHaveLength(2); // ping and the parse error; the notification gets nothing
		expect(answers[0]).toEqual({ jsonrpc: '2.0', id: 1, result: {} });
		expect(answers[1].error).toMatchObject({ code: -32700 });
	});
});

describe('tools without a server', () => {
	const server = createMcpServer({ registry });

	it('offers only the tools that work without one', () => {
		expect(server.tools).toEqual(['list_steps', 'validate_flow', 'patch_flow', 'test_flow']);
	});

	it('lists steps and filters them', async () => {
		const all = await server.handle(call('list_steps'));
		expect(textOf(all)).toContain('`test.notify`');
		const filtered = await server.handle(call('list_steps', { search: 'notify' }));
		expect(textOf(filtered)).toContain('1 of 2 steps match');
		expect(dataOf<{ steps: { kind: string }[] }>(filtered)?.steps.map((step) => step.kind)).toEqual(['test.notify']);
	});

	it('validates a flow and points at the problem', async () => {
		const good = await server.handle(call('validate_flow', { flow }));
		expect(textOf(good)).toContain('Valid');

		const broken = await server.handle(call('validate_flow', { flow: { ...flow, nodes: [flow.nodes[0], { id: 'tell', kind: 'test.notify', config: {} }] } }));
		expect(textOf(broken)).toContain('nodes[1].config.to');
		expect(dataOf<{ ok: boolean }>(broken)?.ok).toBe(false);
	});

	it('runs a flow in simulate mode', async () => {
		const response = await server.handle(call('test_flow', { flow, payload: { from: 'test' } }));
		expect(textOf(response)).toContain('is completed');
		expect(textOf(response)).toContain('Would tell team@example.com');
		expect(dataOf<RunState>(response)?.steps.tell.output).toEqual({ sent: 'team@example.com' });
	});

	it('names the argument when the operations are missing or misnamed', async () => {
		const misnamed = await server.handle(call('patch_flow', { flow, ops: [{ op: 'set', path: 'name', value: 'x' }] }));
		expect(isError(misnamed)).toBe(true);
		expect(textOf(misnamed)).toContain('"operations"');
		expect(textOf(misnamed)).toContain('"ops"');
	});

	it('refuses to run a flow with errors', async () => {
		const response = await server.handle(call('test_flow', { flow: brokenFlow }));
		expect(isError(response)).toBe(true);
		expect(textOf(response)).toContain('Fix the flow first');
	});
});

describe('tools with a server', () => {
	const store: FlowStore = {
		listFlows: vi.fn(async () => [{ id: 'tell-the-team', name: 'Tell the team', active: true, version: 2 }]),
		getFlow: vi.fn(async (id: string) => ({ id, name: 'Tell the team', active: true, version: 2, flow })),
		saveFlow: vi.fn(async ({ id, active }) => ({ id: id ?? 'tell-the-team-a1b2c3', name: 'Tell the team', version: 1, active: active ?? false })),
		startRun: vi.fn(async () => ({ id: 'run_1', status: 'completed' })),
		getRun: vi.fn(async (id: string) => ({
			id,
			status: 'completed',
			state: {
				id,
				flow: 'tell-the-team',
				mode: 'live',
				status: 'completed',
				startedAt: 0,
				updatedAt: 1,
				vars: {},
				scopes: {},
				steps: { tell: { nodeId: 'tell', status: 'success', attempts: 1, output: { sent: 'team@example.com' } } }
			} as RunState
		}))
	};
	const server = createMcpServer({ registry, store });

	it('offers the full set', () => {
		expect(server.tools).toContain('save_flow');
		expect(server.tools).toContain('run_flow');
		expect(server.tools).toContain('get_run');
	});

	it('saves, runs and reads back', async () => {
		const saved = await server.handle(call('save_flow', { flow }));
		expect(textOf(saved)).toContain('Saved “Tell the team” as tell-the-team-a1b2c3');
		expect(store.saveFlow).toHaveBeenCalledWith({ flow: expect.objectContaining({ name: 'Tell the team' }) });

		const run = await server.handle(call('run_flow', { id: 'tell-the-team', mode: 'live' }));
		expect(textOf(run)).toContain('Run run_1 is completed');
		expect(store.startRun).toHaveBeenCalledWith('tell-the-team', { mode: 'live' });

		const read = await server.handle(call('get_run', { id: 'run_1' }));
		expect(textOf(read)).toContain('tell: success');
	});

	it('will not activate a flow that has errors', async () => {
		const response = await server.handle(call('save_flow', { flow: brokenFlow, active: true }));
		expect(isError(response)).toBe(true);
		expect(textOf(response)).toContain('before activating');
	});

	it('turns a server failure into a readable tool error', async () => {
		const failing = createMcpServer({
			registry,
			store: { ...store, getFlow: async () => { throw new Error('Flow "ghost" does not exist.'); } }
		});
		const response = await failing.handle(call('get_flow', { id: 'ghost' }));
		expect(isError(response)).toBe(true);
		expect(textOf(response)).toBe('Flow "ghost" does not exist.');
	});
});
