import { describe, expect, it } from 'vitest';
import { createEngine, createRegistry, defineNode, f, isManifestRegistry, registryFromManifest, toManifest } from '../src/index.js';
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

	it('carries the sub-flow marker, so a browser knows which step opens another flow', () => {
		const caller = defineNode({
			kind: 'test.call',
			title: 'Run flow',
			description: 'Runs another flow.',
			subflow: { field: 'flow' },
			outputs: [{ id: 'out' }],
			config: { flow: f.string() },
			run: (ctx) => ({ call: { flow: ctx.config.flow } })
		});
		const withCaller = createRegistry([...registry.nodes, caller]);
		const manifest = toManifest(withCaller);
		expect(manifest.steps.find((step) => step.kind === 'test.call')?.subflow).toEqual({ field: 'flow' });

		const remote = registryFromManifest(JSON.parse(JSON.stringify(manifest)));
		const rebuilt = (kind: string) => remote.nodes.find((node) => node.kind === kind);
		expect(rebuilt('test.call')?.subflow).toEqual({ field: 'flow' });
		expect(rebuilt('test.approve')?.subflow).toBeUndefined();
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

	it('refuses to run steps that live on the server, in words a user can read', async () => {
		const remote = overTheWire();
		expect(isManifestRegistry(remote)).toBe(true);
		expect(isManifestRegistry(registry)).toBe(false);

		const run = await createEngine(remote).start(paymentFlow().build(), { mode: 'live' });
		expect(run.status).toBe('failed');
		expect(run.error?.message).toMatch(/runs on the flow server/);
		// The step's title, not its kind, and no talk of catalogs or missing code.
		expect(run.error?.message).toContain('"Start"');
		expect(run.error?.message).not.toMatch(/catalog|no code/);
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
