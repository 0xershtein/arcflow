import { describe, expect, it } from 'vitest';
import { createEngine, registryFromManifest, toManifest } from '../src/index.js';
import { paymentFlow, registry } from './fixtures.js';

/** What a browser receives: the manifest as JSON text. */
const overTheWire = () => registryFromManifest(JSON.parse(JSON.stringify(toManifest(registry))));

describe('step manifest', () => {
	it('carries every step with its config, outputs and categories', () => {
		const manifest = toManifest(registry);
		expect(manifest.steps.map((step) => step.kind)).toEqual(registry.nodes.map((node) => node.kind));
		const approve = manifest.steps.find((step) => step.kind === 'test.approve')!;
		expect(approve.outputs.map((port) => port.id)).toEqual(['approved', 'rejected']);
		expect(approve.config.threshold).toMatchObject({ kind: 'number', default: 1 });
		expect(manifest.categories).toEqual([...registry.categories]);
		expect(JSON.parse(JSON.stringify(manifest))).toEqual(manifest); // plain JSON, no functions
	});

	it('rebuilds a registry that parses and validates the same way', () => {
		const remote = overTheWire();
		const flow = paymentFlow().build();
		const here = registry.parse(flow);
		const there = remote.parse(flow);
		expect(there.ok).toBe(true);
		expect(there.flow).toEqual(here.flow);

		const broken = { version: 1, name: 'x', nodes: [{ id: 'a', kind: 'test.approve', config: { signers: [] } }], edges: [] };
		expect(remote.parse(broken).issues.map((issue) => `${issue.code}@${issue.path}`)).toContain('too_small@nodes[0].config.signers');
	});

	it('refuses to run steps that live on the server', async () => {
		const remote = overTheWire();
		const run = await createEngine(remote).start(paymentFlow().build(), { mode: 'live' });
		expect(run.status).toBe('failed');
		expect(run.error?.message).toMatch(/runs on the server/);
	});

	it('rejects a manifest from another version and keeps unknown fields usable', () => {
		expect(() => registryFromManifest({ version: 99, steps: [] })).toThrow(/version/);
		expect(() => registryFromManifest({ steps: 'nope' })).toThrow(/manifest/);
		const odd = registryFromManifest({
			version: 1,
			categories: [],
			sampleVars: {},
			steps: [{ kind: 'x.odd', title: 'Odd', description: '', outputs: [{ id: 'out' }], config: { weird: { kind: 'unheard-of' } } }]
		});
		expect(odd.nodes.find((node) => node.kind === 'x.odd')?.config.weird).toEqual({ kind: 'json' });
	});
});
