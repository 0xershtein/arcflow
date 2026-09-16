import {
	PROTOCOL_VERSION,
	RpcError,
	failure,
	readMessages,
	result,
	toolResult,
	type JsonRpcRequest,
	type JsonRpcResponse
} from './protocol.js';
import { toolsFor, type ToolContext } from './tools.js';

export interface McpServerOptions extends ToolContext {
	/** Shown to the client during initialize. */
	name?: string;
	version?: string;
}

const isRequest = (value: unknown): value is JsonRpcRequest =>
	typeof value === 'object' && value !== null && typeof (value as JsonRpcRequest).method === 'string';

/**
 * An MCP server over JSON-RPC. `handle()` answers one message; `serve()` reads a stream
 * of newline-delimited messages and writes the answers back.
 */
export function createMcpServer(options: McpServerOptions) {
	const context: ToolContext = { registry: options.registry, store: options.store, services: options.services };
	const available = toolsFor(context);
	const info = { name: options.name ?? 'arcflow', version: options.version ?? '0.1.0' };

	async function handle(message: unknown): Promise<JsonRpcResponse | null> {
		if (!isRequest(message)) return failure(null, RpcError.InvalidRequest, 'Not a JSON-RPC request.');
		const id = message.id ?? null;
		const params = message.params ?? {};

		switch (message.method) {
			case '__parse_error__':
				return failure(null, RpcError.ParseError, 'Message was not valid JSON.');

			case 'initialize':
				return result(id, {
					protocolVersion: typeof params.protocolVersion === 'string' ? params.protocolVersion : PROTOCOL_VERSION,
					capabilities: { tools: { listChanged: false } },
					serverInfo: info,
					instructions:
						'Build automation flows for arcflow. Call list_steps first: it is the only source of step kinds, settings and outputs. Check a flow with validate_flow; when it reports a problem, fix that one path with patch_flow rather than rewriting the flow. Try it with test_flow, then save_flow and run_flow.'
				});

			// Notifications carry no id and get no answer.
			case 'notifications/initialized':
			case 'notifications/cancelled':
				return null;

			case 'ping':
				return result(id, {});

			case 'tools/list':
				return result(id, {
					tools: available.map(({ name, description, inputSchema }) => ({ name, description, inputSchema }))
				});

			case 'tools/call': {
				const name = typeof params.name === 'string' ? params.name : '';
				const tool = available.find((candidate) => candidate.name === name);
				if (!tool) return failure(id, RpcError.InvalidParams, `No tool named "${name}".`);
				const args = (typeof params.arguments === 'object' && params.arguments !== null ? params.arguments : {}) as Record<string, unknown>;
				try {
					return result(id, toolResult(await tool.run(args, context)));
				} catch (error) {
					// Tool failures are results, not protocol errors: the agent reads them and tries again.
					return result(id, toolResult({ text: error instanceof Error ? error.message : String(error), isError: true }));
				}
			}

			default:
				return message.id === undefined ? null : failure(id, RpcError.MethodNotFound, `Unknown method "${message.method}".`);
		}
	}

	return {
		handle,
		get tools() {
			return available.map((tool) => tool.name);
		},
		/** Reads messages from `input` and writes answers to `output`, until the input ends. */
		async serve(input: AsyncIterable<string | Uint8Array>, output: { write(chunk: string): unknown }) {
			for await (const message of readMessages(input)) {
				const response = await handle(message);
				if (response) output.write(`${JSON.stringify(response)}\n`);
			}
		}
	};
}

export type McpServer = ReturnType<typeof createMcpServer>;
