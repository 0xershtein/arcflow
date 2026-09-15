import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

/**
 * Serves the editor as a page on the same origin as the API — what `arcflow dev` adds to `arcflow serve`.
 * Needs `@arcflow/editor` to be installed; the bundle it ships is served as is, with no build step.
 */

const page = (title: string) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title>
<style>
	html, body { height: 100%; margin: 0; background: #f7f7f8; }
	@media (prefers-color-scheme: dark) { html, body { background: #0f0f11; } }
	#app { height: 100%; }
	#app:empty::after {
		content: 'Loading the editor…';
		display: grid;
		height: 100%;
		place-items: center;
		font: 14px ui-sans-serif, system-ui, sans-serif;
		color: #71717a;
	}
</style>
</head>
<body>
<div id="app"></div>
<script type="module">
	import { createArcflowApp } from './arcflow.js';
	createArcflowApp('#app', { storageKey: 'arcflow:dev' }).catch((error) => {
		document.querySelector('#app').textContent = error.message;
	});
</script>
</body>
</html>
`;

export interface EditorUiOptions {
	/** Browser tab title. */
	title?: string;
}

/** Returns a handler that answers `/` and `/arcflow.js`, and `undefined` for anything else. */
export function createEditorUi(options: EditorUiOptions = {}) {
	const title = options.title ?? 'arcflow';
	let bundle: Promise<{ code: string; map?: string }> | null = null;

	const load = () =>
		(bundle ??= (async () => {
			const require = createRequire(import.meta.url);
			let file: string;
			try {
				file = require.resolve('@arcflow/editor/app');
			} catch {
				throw new Error('The editor is not installed here. Add it with: npm install @arcflow/editor');
			}
			const code = await readFile(file, 'utf8');
			const map = await readFile(join(dirname(file), 'app.js.map'), 'utf8').catch(() => undefined);
			return { code, map };
		})());

	return async function serveEditor(request: Request): Promise<Response | undefined> {
		const { pathname } = new URL(request.url);
		if (request.method !== 'GET' && request.method !== 'HEAD') return undefined;
		if (pathname === '/' || pathname === '/index.html') {
			return new Response(page(title), { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
		}
		if (pathname === '/arcflow.js' || pathname === '/app.js.map') {
			try {
				const { code, map } = await load();
				if (pathname === '/app.js.map') {
					return map ? new Response(map, { headers: { 'content-type': 'application/json' } }) : new Response(null, { status: 404 });
				}
				return new Response(code, { headers: { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' } });
			} catch (error) {
				return new Response(error instanceof Error ? error.message : String(error), { status: 500 });
			}
		}
		return undefined;
	};
}
