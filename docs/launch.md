# Launch material

Drafts for the two parts of M6 that are not code: a short video and the announcement thread. Both stay inside what `PRODUCT.md` says is true — numbers are the ones measured in this repository, and nothing is claimed that has not shipped. Update them on the day of the release if the counts have moved.

## Video (about 90 seconds, screen recording, no talking head)

Record at 1920×1080 with the docs site or `arcflow dev` open. Voice-over in plain speech, one sentence per shot. No music louder than the voice.

| # | On screen | Voice-over |
| --- | --- | --- |
| 1 | `defineNode({...})` — the email step from the landing page, in an editor, fully visible | "This is one step definition. Its settings, its outputs, what it does." |
| 2 | Split view: the same definition, and next to it the four outputs appearing one by one — the TypeScript type, the validation issue, the form on the canvas, the catalog entry | "From that one definition arcflow gives you the types, the validation, the form on the canvas, and the catalog a model reads. They can't drift, because there is only one source." |
| 3 | The editor, empty canvas, `arcflow dev` running in a terminal beside it | "The editor is one ES module. Mount it in React, Vue, Svelte or plain HTML. It ships with no brand — every colour and every string is yours to set." |
| 4 | Drag a webhook trigger, an HTTP request and an `if` step onto the canvas; connect them; open the inspector | "Flows are plain JSON in and plain JSON out, so you can store them, diff them, review them." |
| 5 | Click **Test run**; steps light up in order; the run log docked under the canvas | "A test run sends nothing, and every step says what it would have done." |
| 6 | Paste a flow with a mistake (a missing URL) as JSON; the issue appears with its path `nodes[1].config.url` | "Every problem is a typed issue with a stable code and a JSON path." |
| 7 | Terminal: `claude mcp add arcflow -- npx -y @arcflow/mcp`, then Claude Code asked to "build a flow that fetches open invoices every Monday and posts a summary" — `list_steps`, `validate_flow`, `patch_flow`, `test_flow` calls scroll by | "That path is what lets an agent fix its own flow. Over MCP, a coding agent lists your steps, writes the flow, gets it checked, patches one field instead of rewriting, and runs it." |
| 8 | The editor again: the prompt bar builds the same flow live on the canvas; **Keep** | "The same thing works from the prompt bar in the editor." |
| 9 | Terminal: `ARCFLOW_SECRET=… npx arcflow serve --db ./arcflow.db`, then `curl -X POST localhost:8787/hooks/orders/created` and the run appearing in the history panel | "And when it's time to run for real: webhooks, cron, timers that survive a restart, run history, encrypted credentials. One command." |
| 10 | Landing page with the install command, then the GitHub repository | "arcflow. MIT, on npm and GitHub." |

Cut anything that runs long; shots 2, 6 and 7 carry the argument. Record shot 7 for real against a running MCP server and cut it down, rather than staging it.

## Thread

Post 1 is the whole pitch; the rest can be posted over an hour. Attach the video to post 1 and a canvas screenshot to post 4.

**1.**
arcflow is out: an embeddable, n8n-style flow editor and engine for your own product, with an MCP server so coding agents can build and run flows too.

Define a step once. Get the types, the validation, the canvas form and the LLM catalog from that one definition.

MIT, on npm: `npm i @arcflow/core @arcflow/editor`

**2.**
Why one definition matters: every flow tool has a schema layer, a form layer and a runtime, and they drift. In arcflow there is one `defineNode({ config: { url: f.string() } })` and everything else is derived from it, so the canvas can't disagree with the engine.

**3.**
Everything a person or a model touches is JSON. Flows are versioned JSON with a published schema; parsing never throws, it returns issues with a stable code and a JSON path:

`error required @ nodes[1].config.url`

That line is what lets an LLM repair its own output instead of guessing.

**4.**
The editor is framework-free — `createEditor(element, options)` — and unbranded on purpose. 17 colour tokens, 135 replaceable strings, three step shapes, light/dark/auto. It's meant to look like your product, not like ours.

**5.**
For agents: `claude mcp add arcflow -- npx -y @arcflow/mcp`

Claude Code or Cursor can `list_steps`, `validate_flow`, `patch_flow` (one field at the path an issue reported, not a rewrite) and `test_flow`. Against a running server, also save and run.

**6.**
Running for real is one command: `npx arcflow serve`. Webhooks, cron, timers that survive restarts, run history, AES-256-GCM credentials, live events over SSE. SQLite by default, memory for tests.

**7.**
What's in the box today: 13 standard steps (HTTP, sandboxed JavaScript in QuickJS, if/switch/merge/loop/wait, sub-flows), joins, loops with concurrency, retries, pause and resume for approvals. 248 tests. No dependencies in the engine.

**8.**
Where it came from: we needed payout flows for a multisig product and didn't want the flow builder to carry our brand or our backend. So it doesn't. The example pack in the repo is a payroll flow gated by a multisig approval.

**9.**
Docs, with the editor running in the page: https://arcsig-labs.github.io/arcflow/
Repo: https://github.com/arcsig-labs/arcflow

It's 0.1.0. Tell us what's wrong with it.

## Show HN / forum post

Title: **arcflow – Embeddable n8n-style flow editor and engine, with an MCP server for agents**

Body: the first two sentences of post 1, then posts 2, 3 and 5 as paragraphs, then the two links. Answer the first comments with the honest limits: single Anthropic adapter in `@arcflow/ai` so far, SQLite and memory storage only, no custom node renderers yet.
