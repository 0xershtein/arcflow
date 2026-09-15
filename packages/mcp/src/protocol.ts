/** The slice of JSON-RPC 2.0 and MCP this server speaks. */

export const PROTOCOL_VERSION = '2025-06-18';

export interface JsonRpcRequest {
	jsonrpc: '2.0';
	id?: string | number | null;
	method: string;
	params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
	jsonrpc: '2.0';
	id: string | number | null;
	result?: unknown;
	error?: { code: number; message: string; data?: unknown };
}

export const enum RpcError {
	ParseError = -32700,
	InvalidRequest = -32600,
	MethodNotFound = -32601,
	InvalidParams = -32602,
	InternalError = -32603
}

export const result = (id: string | number | null, value: unknown): JsonRpcResponse => ({ jsonrpc: '2.0', id, result: value });

export const failure = (id: string | number | null, code: RpcError, message: string, data?: unknown): JsonRpcResponse => ({
	jsonrpc: '2.0',
	id,
	error: { code, message, ...(data === undefined ? {} : { data }) }
});

export interface ToolDefinition {
	name: string;
	description: string;
	inputSchema: Record<string, unknown>;
}

/** What a tool hands back: text for the agent, plus the raw data it describes. */
export interface ToolOutcome {
	text: string;
	data?: unknown;
	isError?: boolean;
}

/** MCP wraps tool results in content blocks; structured data rides along for clients that read it. */
export const toolResult = (outcome: ToolOutcome) => ({
	content: [{ type: 'text', text: outcome.text }],
	...(outcome.data === undefined ? {} : { structuredContent: { result: outcome.data } }),
	...(outcome.isError ? { isError: true } : {})
});

/** Reads newline-delimited JSON-RPC messages from a stream. */
export async function* readMessages(stream: AsyncIterable<string | Uint8Array>): AsyncGenerator<unknown> {
	const decoder = new TextDecoder();
	let buffer = '';
	for await (const chunk of stream) {
		buffer += typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true });
		let newline: number;
		while ((newline = buffer.indexOf('\n')) >= 0) {
			const line = buffer.slice(0, newline).trim();
			buffer = buffer.slice(newline + 1);
			if (!line) continue;
			try {
				yield JSON.parse(line);
			} catch {
				yield { jsonrpc: '2.0', id: null, method: '__parse_error__' };
			}
		}
	}
}
