import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

// Standalone bundle for a browser with no build step: everything is compiled in, @arcflow/core included.
// `arcflow dev` serves this file next to a one-line HTML page.
export default defineConfig({
	plugins: [svelte({ compilerOptions: { css: 'injected' } })],
	// A library build leaves `process.env` to the consumer's bundler; this file is served straight to a browser.
	define: {
		'process.env.NODE_ENV': '"production"',
		'process.env': '({})'
	},
	build: {
		lib: {
			entry: 'src/app.ts',
			formats: ['es'],
			fileName: () => 'app.js'
		},
		outDir: 'dist',
		emptyOutDir: false,
		target: 'es2022',
		sourcemap: true
	}
});
