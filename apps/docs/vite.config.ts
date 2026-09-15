import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	// The workspace packages ship TypeScript sources, so Vite must transform them
	// instead of handing them to Node's ESM resolver when rendering on the server.
	ssr: { noExternal: ['@arcflow/core', '@arcflow/nodes', '@arcflow/editor'] },
	plugins: [
		sveltekit({
			compilerOptions: {
				// Runes everywhere except libraries. Can go in Svelte 6.
				runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true)
			},
			// The whole site is prerendered, so it drops on any static host.
			adapter: adapter({ fallback: '404.html' })
		})
	]
});
