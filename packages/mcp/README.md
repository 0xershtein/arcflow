# @arcsig-labs/mcp

An [MCP](https://modelcontextprotocol.io) server for [arcflow](https://github.com/arcsig-labs/arcflow): agents like Claude Code and Cursor can look up the steps you registered, write a flow, check it, try it, save it and run it.

```sh
# with a running server, so flows can be saved and run for real
claude mcp add arcflow -- npx -y @arcsig-labs/mcp --url http://127.0.0.1:8787

# without one: the catalog, validation and simulated runs
claude mcp add arcflow -- npx -y @arcsig-labs/mcp
```

Your own steps come along with `--steps ./my-steps.js` (a module exporting a pack or step definitions), exactly as with `arcflow serve`.

## Tools

| | |
| --- | --- |
| `list_steps` | Every step: kind, settings, outputs, what it does. The only source of truth — nothing else exists |
| `validate_flow` | Checks a flow and returns problems with their JSON paths |
| `test_flow` | Runs it in simulate mode: no requests are sent, every step reports what it would do |
| `patch_flow` | Changes part of a flow instead of rewriting it — `set` and `remove` take the path an issue reported, `addNode`, `removeNode`, `connect` and `disconnect` do the wiring. All or nothing |
| `list_flows`, `get_flow` | What is saved on the server |
| `save_flow` | Creates a flow or saves a new version; `active: true` lets webhooks and schedules fire it |
| `run_flow` | Runs a saved flow, live or simulated |
| `get_run` | A run's status, steps, outputs and errors |

The last four need `--url`. Everything else works on its own, so an agent can draft a flow without touching a server.

## In your own process

```ts
import { createRegistry } from '@arcsig-labs/core';
import { standardSteps } from '@arcsig-labs/nodes';
import { createHttpStore, createMcpServer } from '@arcsig-labs/mcp';

const server = createMcpServer({
	registry: createRegistry([standardSteps, myPack]),
	store: createHttpStore('http://127.0.0.1:8787', { apiKey })
});

await server.serve(process.stdin, process.stdout);
```

`handle(message)` answers a single JSON-RPC message if you have your own transport, and `FlowStore` is a five-method interface — implement it to keep flows in your own database instead of an arcflow server.

`createMcpServer` also takes `name` and `version`, which are what an MCP client shows during
initialize; both default to this package's own name and version.
