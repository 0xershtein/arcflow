import { registryFromManifest } from '@arcsig-labs/core';
import { createHttpBackend, type HttpBackendOptions } from './backend.js';
import { createEditor, type CreateEditorOptions, type EditorInstance } from './vanilla.svelte.js';

export * from './index.js';

export interface AppOptions extends Partial<Omit<CreateEditorOptions, 'steps'>> {
	/** Server root. Defaults to the page's own origin. */
	url?: string;
	apiKey?: string;
	/** Custom fetch for the API calls. */
	fetch?: HttpBackendOptions['fetch'];
	/** Step types. By default they come from the server's catalog, so the editor needs no build step. */
	steps?: CreateEditorOptions['steps'];
}

/**
 * The whole editor against a running server: fetches the step catalog, builds a registry from it
 * and mounts the editor in server mode. This is what `arcflow dev` serves.
 *
 *   await createArcflowApp('#app', { url: 'http://localhost:8787' });
 */
export async function createArcflowApp(target: HTMLElement | string, options: AppOptions = {}): Promise<EditorInstance> {
	const { url, apiKey, fetch, steps, ...rest } = options;
	const backend = createHttpBackend(url ?? globalThis.location?.origin ?? '', { apiKey, fetch });
	let registry = steps;
	if (!registry) {
		const catalog = (await backend.manifest?.()) as { manifest?: unknown } | undefined;
		if (!catalog?.manifest) throw new Error('The server did not send a step catalog. Is it running @arcsig-labs/server 0.2 or newer?');
		registry = registryFromManifest(catalog.manifest);
	}
	return createEditor(target, { ...rest, steps: registry, backend });
}
