#!/usr/bin/env node
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { createRegistry, type AnyNodeDefinition, type Pack } from '@arcflow/core';
import { standardSteps } from '@arcflow/nodes';
import { createHttpStore } from './http-store.js';
import { createMcpServer } from './server.js';

const USAGE = `Usage: arcflow-mcp [options]

An MCP server over stdio: lets an agent list steps, write, validate, test, save and run flows.

Options:
  --url <address>   arcflow server for saving and running flows (e.g. http://127.0.0.1:8787)
  --api-key <key>   Bearer token for that server (or ARCFLOW_API_KEY)
  --steps <module>  JS module exporting a pack or step definitions (repeatable)
  -h, --help        Show this help

Without --url the server still lists steps, validates flows and runs them in simulate mode.

In Claude Code:
  claude mcp add arcflow -- npx -y @arcflow/mcp --url http://127.0.0.1:8787
`;

const { values } = parseArgs({
	allowPositionals: true,
	options: {
		url: { type: 'string' },
		'api-key': { type: 'string' },
		steps: { type: 'string', multiple: true },
		help: { type: 'boolean', short: 'h' }
	}
});

if (values.help) {
	console.log(USAGE);
	process.exit(0);
}

const sources: (Pack | AnyNodeDefinition)[] = [standardSteps];
for (const file of values.steps ?? []) {
	const module = await import(pathToFileURL(resolve(file)).href);
	const exported = module.default ?? module.pack ?? module.steps;
	if (!exported) throw new Error(`${file} must export a pack or step definitions (default, "pack" or "steps").`);
	sources.push(...(Array.isArray(exported) ? exported : [exported]));
}

const url = values.url ?? process.env.ARCFLOW_URL;
const server = createMcpServer({
	registry: createRegistry(sources),
	...(url ? { store: createHttpStore(url, { apiKey: values['api-key'] ?? process.env.ARCFLOW_API_KEY }) } : {})
});

// stdout is the protocol channel; anything human-readable goes to stderr.
console.error(`arcflow MCP server ready${url ? ` (server ${url})` : ' (no server: flows are not saved)'}`);
process.stdin.setEncoding('utf8');
await server.serve(process.stdin, process.stdout);
