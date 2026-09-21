# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Developers putting a flow builder inside their own product.** They already have a product and a domain; they need the canvas, the forms, the validation and the runtime without adopting someone else's brand or backend. They arrive from GitHub or npm and decide in minutes.
- **Coding agents and LLMs.** Claude Code, Cursor and anything speaking MCP read the step catalog, write a flow as JSON, get it checked, fix it and run it. The user's framing: arcflow should read as a tool, and as AI-first — easy to drive with a model.
- **The maintainers**, who consume it in a sibling product (arcsig) and need the packages to stay unbranded.

## Product Purpose

A typed flow engine with an n8n-style editor on top. A step is defined once, and that one definition yields TypeScript types, runtime validation, the form on the canvas, and a catalog a model can build against. Flows are plain JSON in and plain JSON out, so they can be stored, diffed, reviewed, generated and run headless or on a server.

Success: a developer embeds the editor and ships their own automation feature without writing a canvas, a form layer or a runtime — and an agent can build and run a working flow from the catalog alone, without a human translating.

## Positioning

The single step definition is the mechanism: four artifacts from one source, so the canvas, the validation, the types and the model-facing catalog can never drift apart. Around it, everything a person or a model touches is JSON, and every failure is a typed issue with a stable code and a JSON path — which is what lets an LLM repair its own output instead of guessing.

Neighboring products pick one side: hosted automation tools own the runtime but not the embed, and canvas libraries own the drawing but neither the schema nor the run.

## Operating Context

- Installed from npm into someone's app (`@arcsig-labs/core`, `@arcsig-labs/editor`, `@arcsig-labs/nodes`, `@arcsig-labs/server`, `@arcsig-labs/ai`, `@arcsig-labs/mcp`), or run as `npx -y -p @arcsig-labs/server -p @arcsig-labs/editor arcflow dev`, which serves the editor and the API on one origin.
- Added to a coding agent as an MCP server: `claude mcp add arcflow -- npx -y @arcsig-labs/mcp`.
- Evaluated on GitHub (`arcsig-labs/arcflow`, MIT) and on the docs site, which is prerendered and deployed to GitHub Pages by CI.
- The editor is framework-free: one ES module with Svelte compiled in, mounted by `createEditor(element, options)` from React, Vue, Angular or plain HTML; a `/svelte` entry for Svelte apps.

## Capabilities and Constraints

Measured in this repository, 2026-09-16:

- **Catalog:** 39 entries, 7 042 characters from `registry.describe()`; 20 KB of JSON Schema from `registry.toJSONSchema()`; 13 standard steps in `@arcsig-labs/nodes`.
- **Engine:** branching, joins (`any` / `all`), loops with concurrency, sub-flows, retries, timeouts, `wait` / `resume`, credentials, dead-branch elimination, expressions without `eval`.
- **Validation:** `registry.parse()` never throws; each issue carries a level, a stable code and a JSON path (`error required @ nodes[1].config.url`).
- **Editor:** 16 options, 9 theme options, 14 UI options, 19 colour tokens, 151 replaceable strings, 3 step shapes (`card`, `tile`, `compact`).
- **Agents:** MCP over stdio exposes 4 tools standalone (`list_steps`, `validate_flow`, `patch_flow`, `test_flow`) and 9 against a running server. `applyPatch` acts on the same JSON path an issue reports.
- **Code step** runs in a fresh QuickJS sandbox per step: no network, no filesystem, 1 s CPU and 32 MB heap by default.
- **Test suite:** 318 tests, 26 files, and `pnpm check` across every package and app.

Undecided or not yet true, and not to be implied anywhere:

- Version 0.1.0 was published to npm on 2026-09-21 under the `@arcsig-labs` scope (the `@arcflow` scope belongs to an unrelated user). The docs site is live on GitHub Pages.
- No users, customers, testimonials, benchmarks or download counts exist. None may be invented.

## Brand Commitments

- The name is **arcflow**, lowercase, always.
- **The packages stay unbranded.** No arcsig identity, no product colours: the default theme is neutral grey with system fonts, every colour is a `--fb-*` token and every string lives in `labels`, because hosts are meant to make it look like theirs. The documentation site may have taste of its own; the editor it ships must not inherit it.
- MIT licensed. Built on Svelte and Svelte Flow, which the footer credits.
- Voice: plain, concrete, unhyped. Say what a thing does and what it costs; no superlatives, no "revolutionary", no emoji headings.

## Evidence on Hand

- The live editor itself, embeddable in a page — the strongest proof available, already used on the docs site.
- The measured numbers above, all reproducible from this repository.
- A real agent transcript from today: catalog → a flow with a deliberate mistake → `error required @ nodes[1].config.url` → one-field fix → 0 issues → simulated run reporting `GET example.com/status returned 404 Not Found`.
