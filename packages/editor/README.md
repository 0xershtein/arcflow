# @arcflow/editor

Embeddable n8n-style flow editor. One ES module with its styles; no framework required.

```ts
import { createEditor } from '@arcflow/editor';

const editor = createEditor(document.querySelector('#editor'), {
	steps,                // from @arcflow/core createRegistry, or packs / step definitions
	flow,                 // Flow JSON (optional)
	theme: 'auto',        // or { mode, colors, light, dark, fontFamily, radius, nodeWidth, ... }
	ui: { minimap: true },
	labels: { testRun: 'Dry run' },
	onChange: (flow) => save(flow),
	onValidate: (issues) => setProblems(issues)
});
```

The container needs a height; the editor fills it. Styles are injected into the document (or the element's shadow root) once; pass `injectStyles: false` to manage CSS yourself.

## API

| | |
| --- | --- |
| `getFlow()` | Current flow JSON |
| `getIssues()` | Current problems |
| `setFlow(flow)` | Replace the flow → `{ loaded, issues }` |
| `setOptions(partial)` | Update theme, ui, labels, readonly, callbacks |
| `run()` | Simulated run on the canvas (or stop it) |
| `undo()` / `redo()` | Step through edit history |
| `destroy()` | Unmount |

## Editing

- **Insert on a connection:** hover a connection and press `+`, pick a step; later steps move right to make room.
- **Drag a connection into empty space** (or click an output) to add a connected step.
- **Sticky notes:** the Note button adds one; double-click to edit, drag the corners to resize. Notes are saved as `annotations` in the flow JSON and ignored when it runs.
- **Selection:** Shift-drag for a box, Shift/⌘-click to add; the bar on top duplicates or deletes the selection.
- **Clipboard:** copying puts the selected steps (with their connections) on the clipboard as flow JSON. Pasting accepts that or any `{ nodes, edges }` JSON, e.g. from an LLM; ids that are taken get a suffix and `{{ steps.<id> }}` references follow.

| Shortcut | |
| --- | --- |
| ⌘Z / Ctrl+Z | Undo |
| ⇧⌘Z / Ctrl+Y | Redo |
| ⌘C, ⌘X, ⌘V | Copy, cut, paste |
| ⌘D | Duplicate |
| ⌘A | Select all |
| Backspace / Delete | Delete selection |
| Esc | Close the picker, clear selection |

Shortcuts apply to the editor that was clicked last, and never while typing in a field.

## Server mode

Pass a `backend` and the editor opens and saves flows on a server, activates them, picks stored credentials, runs them for real and replays past runs:

```ts
import { createEditor, createHttpBackend } from '@arcflow/editor';

createEditor('#editor', {
	steps,
	backend: createHttpBackend('http://localhost:8787', { apiKey })
});
```

The toolbar then has a flow list with Save and Activate, an Executions panel with the run history, and a Run button that runs on the server and streams events onto the canvas — Test run still simulates locally. Credential fields become a picker over the server's credentials. `Backend` is a plain interface, so your own API can implement it instead.

Without a build step, let the server hand over its step catalog too:

```html
<div id="app" style="height: 100vh"></div>
<script type="module">
	import { createArcflowApp } from 'https://esm.sh/@arcflow/editor/app';
	createArcflowApp('#app', { url: 'http://localhost:8787' });
</script>
```

`npx arcflow dev` serves exactly this page next to the API.

Exports `lightColors`, `darkColors`, `defaultLabels` and `defaultUi` so you can start from the defaults.

Svelte apps can import the component instead: `import { FlowEditor } from '@arcflow/editor/svelte'`.

See the [repository README](https://github.com/0xershtein/arcflow#readme) for the full option reference.
