import { describe, expect, it } from 'vitest';
import { applyPatch, removalCost, type Flow } from '../src/index.js';
import { paymentFlow, registry } from './fixtures.js';

const flow = (): Flow => paymentFlow().build();

describe('applyPatch', () => {
	it('sets the field a validation issue points at, by index or by id', () => {
		const start = flow();
		const index = start.nodes.findIndex((node) => node.id === 'check');

		const byIndex = applyPatch(start, [{ op: 'set', path: `nodes[${index}].config.value`, value: 42 }]);
		expect(byIndex.applied).toBe(true);
		expect(byIndex.flow.nodes[index].config.value).toBe(42);

		const byId = applyPatch(start, [{ op: 'set', path: 'nodes[check].config.value', value: 7 }]);
		expect(byId.applied).toBe(true);
		expect(byId.flow.nodes[index].config.value).toBe(7);

		// The flow handed in is never touched.
		expect(start.nodes[index].config.value).not.toBe(42);
	});

	it('answers a real validation issue with a patch at its own path', () => {
		const broken = registry.parse({
			version: 1,
			name: 'Missing a field',
			nodes: [
				{ id: 'start', kind: 'test.start', config: {} },
				{ id: 'check', kind: 'test.if', config: {} }
			],
			edges: [{ from: 'start', to: 'check' }]
		});
		const issue = broken.issues.find((entry) => entry.code === 'required');
		expect(issue?.path).toBe('nodes[1].config.value');

		const patched = applyPatch(broken.flow!, [{ op: 'set', path: issue!.path, value: 1 }]);
		expect(patched.applied).toBe(true);
		expect(registry.validate(patched.flow).filter((entry) => entry.level === 'error')).toEqual([]);
	});

	it('adds a step and wires it in one operation', () => {
		const result = applyPatch(flow(), [
			{ op: 'addNode', node: { id: 'audit', kind: 'test.note', config: { text: 'logged' } }, after: 'send' }
		]);
		expect(result.applied).toBe(true);
		expect(result.flow.nodes.at(-1)).toMatchObject({ id: 'audit', kind: 'test.note' });
		expect(result.flow.edges).toContainEqual({ id: 'send:out->audit', from: 'send', port: 'out', to: 'audit' });
	});

	it('takes the connections with the step it removes', () => {
		const start = flow();
		expect(removalCost(start, 'sign')).toHaveLength(2);

		const result = applyPatch(start, [{ op: 'removeNode', id: 'sign' }]);
		expect(result.applied).toBe(true);
		expect(result.flow.nodes.some((node) => node.id === 'sign')).toBe(false);
		expect(result.flow.edges.some((edge) => edge.from === 'sign' || edge.to === 'sign')).toBe(false);
	});

	it('connects and disconnects by port', () => {
		const connected = applyPatch(flow(), [{ op: 'connect', from: 'check', port: 'false', to: 'done' }]);
		expect(connected.applied).toBe(true);
		expect(connected.flow.edges).toContainEqual({ id: 'check:false->done', from: 'check', port: 'false', to: 'done' });

		const again = applyPatch(connected.flow, [{ op: 'connect', from: 'check', port: 'false', to: 'done' }]);
		expect(again.applied).toBe(false);
		expect(again.failures[0].message).toMatch(/already connects/);

		const removed = applyPatch(connected.flow, [{ op: 'disconnect', from: 'check', to: 'done', port: 'false' }]);
		expect(removed.applied).toBe(true);
		expect(removed.flow.edges.some((edge) => edge.id === 'check:false->done')).toBe(false);
	});

	it('applies nothing when any operation fails, and says which one', () => {
		const start = flow();
		const result = applyPatch(start, [
			{ op: 'set', path: 'nodes[check].label', value: 'Runway' },
			{ op: 'set', path: 'nodes[nope].config.value', value: 1 }
		]);
		expect(result.applied).toBe(false);
		expect(result.flow).toBe(start);
		expect(result.failures).toHaveLength(1);
		expect(result.failures[0].index).toBe(1);
		expect(result.failures[0].message).toMatch(/nothing at "nope"/);
	});

	it('refuses a path that is not one, and a duplicate id', () => {
		const bad = applyPatch(flow(), [{ op: 'set', path: 'nodes..config', value: 1 }]);
		expect(bad.failures[0].message).toMatch(/is not a path/);

		const duplicate = applyPatch(flow(), [{ op: 'addNode', node: { id: 'send', kind: 'test.note' } }]);
		expect(duplicate.failures[0].message).toMatch(/already here/);
	});

	it('removes a field so the step falls back to its default', () => {
		const start = applyPatch(flow(), [{ op: 'set', path: 'nodes[check].config.note', value: 'temporary' }]).flow;
		const result = applyPatch(start, [{ op: 'remove', path: 'nodes[check].config.note' }]);
		expect(result.applied).toBe(true);
		expect('note' in result.flow.nodes.find((node) => node.id === 'check')!.config).toBe(false);
	});
});
