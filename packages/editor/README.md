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
| `destroy()` | Unmount |

Exports `lightColors`, `darkColors`, `defaultLabels` and `defaultUi` so you can start from the defaults.

Svelte apps can import the component instead: `import { FlowEditor } from '@arcflow/editor/svelte'`.

See the [repository README](https://github.com/0xershtein/arcflow#readme) for the full option reference.
