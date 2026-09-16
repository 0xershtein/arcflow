#!/usr/bin/env node
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { createRegistry, type AnyNodeDefinition, type Pack } from '@arcflow/core';
import { standardSteps } from '@arcflow/nodes';
import { serveNode, SqliteStorage } from './node.js';
import { createFlowAi } from './ai.js';
import { createServer } from './server.js';
import { createEditorUi } from './ui.js';

const USAGE = `Usage: arcflow serve|dev [options]

Runs flows with the standard steps (and your own) over HTTP.
"dev" also serves the editor at the same address (needs @arcflow/editor).

Options:
  --port <number>     Port to listen on (default 8787)
  --host <name>       Host to bind (default 127.0.0.1)
  --db <file>         SQLite file for flows, runs and credentials (default ./arcflow.db)
  --steps <module>    JS module exporting a pack or step definitions (repeatable)
  --api-key <key>     Require "Authorization: Bearer <key>" on /api (or ARCFLOW_API_KEY)
  --cors <origin>     Allow browser access to /api from this origin
  --no-ai             Do not offer flow generation even with an API key
  -h, --help          Show this help

Environment:
  ARCFLOW_SECRET      Encrypts stored credentials (16+ characters). Credentials are disabled without it.
  ANTHROPIC_API_KEY   Turns on flow generation (/api/ai and the editor's prompt bar).
`;

const { values, positionals } = parseArgs({
	allowPositionals: true,
	options: {
		port: { type: 'string', default: '8787' },
		host: { type: 'string', default: '127.0.0.1' },
		db: { type: 'string', default: './arcflow.db' },
		steps: { type: 'string', multiple: true },
		'api-key': { type: 'string' },
		cors: { type: 'string' },
		ai: { type: 'boolean', default: true },
		help: { type: 'boolean', short: 'h' }
	}
});

const command = positionals[0];
if (values.help || (command !== 'serve' && command !== 'dev')) {
	console.log(USAGE);
	process.exit(values.help ? 0 : 1);
}

const sources: (Pack | AnyNodeDefinition)[] = [standardSteps];
for (const file of values.steps ?? []) {
	const module = await import(pathToFileURL(resolve(file)).href);
	const exported = module.default ?? module.pack ?? module.steps;
	if (!exported) throw new Error(`${file} must export a pack or step definitions (default, "pack" or "steps").`);
	sources.push(...(Array.isArray(exported) ? exported : [exported]));
}

const registry = createRegistry(sources);
// Flow generation needs a model; without a key it stays off and /api/ai answers 501.
const ai = values.ai && process.env.ANTHROPIC_API_KEY ? createFlowAi({ registry }) : undefined;

const server = await createServer({
	registry,
	storage: new SqliteStorage(resolve(values.db)),
	secret: process.env.ARCFLOW_SECRET,
	apiKey: values['api-key'] ?? process.env.ARCFLOW_API_KEY,
	cors: values.cors,
	...(ai ? { ai } : {})
});
// In dev mode the editor is served from the same origin, so the browser needs no CORS and no build step.
const editorUi = command === 'dev' ? createEditorUi({ reload: true }) : undefined;
const served = editorUi
	? { ...server, fetch: async (request: Request) => (await editorUi(request)) ?? server.fetch(request) }
	: server;

const { url } = await serveNode(served, { port: Number(values.port), hostname: values.host });

console.log(`arcflow is running at ${url}
${editorUi ? `  Editor    ${url}\n` : ''}  API       ${url}/api
  Webhooks  ${url}/hooks/<path>
  Database  ${resolve(values.db)}
  Credentials ${process.env.ARCFLOW_SECRET ? 'enabled' : 'disabled (set ARCFLOW_SECRET)'}
  Flow generation ${ai ? 'enabled' : 'disabled (set ANTHROPIC_API_KEY)'}`);
