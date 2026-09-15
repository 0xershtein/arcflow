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

Exports `lightColors`, `darkColors`, `defaultLabels` and `defaultUi` so you can start from the defaults.

Svelte apps can import the component instead: `import { FlowEditor } from '@arcflow/editor/svelte'`.

See the [repository README](https://github.com/0xershtein/arcflow#readme) for the full option reference.
