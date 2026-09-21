import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

// Framework-free bundle: Svelte and Svelte Flow are compiled in, @arcsig-labs/core stays a dependency.
export default defineConfig({
	// Component styles (including Svelte Flow's) are injected by JS, so the bundle ships no separate CSS file.
	plugins: [svelte({ compilerOptions: { css: 'injected' } })],
	build: {
		lib: {
			entry: 'src/index.ts',
			formats: ['es'],
			fileName: () => 'index.js'
		},
		outDir: 'dist',
		target: 'es2022',
		sourcemap: true,
		rollupOptions: {
			external: ['@arcsig-labs/core']
		}
	}
});
