# Docs site coverage

What the docs site (apps/docs) shows for each user-visible capability, checked against
`packages/editor/src/options.ts`, the READMEs and CHANGELOG 0.1.0 on 2026-09-21.

**Live** = running in the page. **Text** = described (code or prose), not runnable there.
**Before** is the state at launch; **Now** is after this pass.

| Capability | Before | Now | Where |
| --- | --- | --- | --- |
| Step shapes `ui.node` (card, tile, compact) | Live | Live | Editor › Playground |
| Theme mode light / dark / auto | Text | Live | Playground |
| Custom colours, fonts, radius | Text (example had `radius` inside `colors`) | Live presets + corrected text | Playground, Theming |
| 19 colour tokens | Text, listed 17 | Text, all 19 | Theming |
| `ui.palette`, `inspector`, `minimap`, `background` | Missing | Live | Playground |
| `ui.controls`, `json`, `importExport`, `testRun`, `attribution` | Missing | Text (options table, attribution section) | Options, Svelte Flow attribution |
| `ui.flows`, `executions`, `ai` | Missing | Text (need a backend) | Options, Server mode, Prompt bar |
| Toolbar parts, compact 40px strip | Missing | Live | Playground (Toolbar: Strip), Your own header |
| `brand` snippet / own header | Missing | Live | Playground (Toolbar: Brand), Your own header |
| `labels` (151 strings, translation) | Text, said 135 | Live German toggle + text | Playground, Text |
| `readonly` | Live (fixed demo) | Live toggle | Playground |
| `vars` | Missing | Live | Run variables and summaries |
| `summaries` | Missing | Live | Run variables and summaries |
| `storageKey`, `services`, `runStepDelay`, callbacks | Missing | Text | Options |
| `createEditor` handle (`setOptions`, `run`, `undo`, …) | Partly (mounting snippets) | Text | Options |
| Narrow container (Add step drawer, More menu) | Missing | Live (420px frame; phones get it natively) | Playground, Small containers |
| Height rules | Missing | Text | Height |
| Svelte Flow attribution | Missing | Text | Svelte Flow attribution |
| Run log: Test run vs live Run header, trigger `sample` | Missing | Test run live; Run as text | Playground, Test run and Run |
| Inspector Input/Output with run data | Text | Live (after a Test run) + text | Playground, Run data |
| Drag-to-map, `{{` autocomplete | Text | Text, runnable in the playground | Run data |
| Undo/redo, copy/paste JSON, `+` on edges, shortcuts | Text | Text, runnable in the playground | Editing |
| Sticky notes | Text (one word) | Live (note in the playground flow) + text | Editing |
| Sub-flow navigation | Text | Text (needs a backend) | Editing |
| Server mode (flow list, Save/Activate, executions) | Text | Text + screenshot from `arcflow dev` | Server mode |
| AI prompt bar (Keep/Discard, Fix problems, Explain) | Text | Text, says it needs a server with a key | Prompt bar, AI and agents |
| MCP tools | Text | Text | AI and agents |
| Headless engine, `simulate` mode | Text, claimed nothing is sent | Text, corrected | Quick start |
| Builder | Text (a `steps.fetch` reference to a step with another id) | Text, fixed | Quick start |
| Validation issues | Text | Text | Flows and steps |
| `applyPatch` | Text (MCP `patch_flow` only) | Text (MCP only) | AI and agents |
| Standard steps list (13) | Missing (count only) | Text table | Flows and steps › Standard steps |
| Server API, webhooks, cron, credentials | Text | Text | Server |
| `arcflow dev` / `serve` commands | Text, `npx arcflow …` 404s on npm | Text, runnable `npx -p @arcsig-labs/server …` | Quick start, Server, AI, Editor |

Still text only on purpose: anything that needs a server or an API key (server mode, prompt bar,
sub-flow navigation, real Runs, MCP), since the site is static. `applyPatch` has no section of its own.
