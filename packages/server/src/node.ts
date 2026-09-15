import type { ArcflowServer } from './server.js';

export { SqliteStorage } from './storage/sqlite.js';

export interface ServeOptions {
	port?: number;
	hostname?: string;
}

/** Starts the server (recovery + scheduler) and serves it with Node's HTTP server. */
export async function serveNode(server: ArcflowServer, options: ServeOptions = {}) {
	const { serve } = await import('@hono/node-server');
	await server.start();
	const port = options.port ?? 8787;
	const hostname = options.hostname ?? '127.0.0.1';
	const http = serve({ fetch: server.fetch, port, hostname });
	return {
		url: `http://${hostname}:${port}`,
		close: async () => {
			await server.stop();
			await new Promise<void>((resolve) => http.close(() => resolve()));
		}
	};
}
