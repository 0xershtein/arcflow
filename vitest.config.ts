import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		include: ['packages/*/test/**/*.test.ts'],
		typecheck: {
			enabled: true,
			include: ['packages/*/test/**/*.test.ts'],
			tsconfig: './packages/core/tsconfig.json'
		}
	}
});
