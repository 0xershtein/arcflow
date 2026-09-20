/**
 * The slice of Vite's `import.meta.env` the editor reads, declared here so the package type-checks
 * without depending on `vite/client`. Hosts on other bundlers simply have no `env`.
 */
interface ImportMeta {
	readonly env?: {
		readonly DEV?: boolean;
		readonly MODE?: string;
	};
}
