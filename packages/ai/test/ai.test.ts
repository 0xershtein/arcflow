import { describe, expect, it, vi } from 'vitest';
import { createRegistry, defineNode, f, type Flow } from '@arcsig-labs/core';
import { buildSystemPrompt, diffFlows, editFlow, explainFlow, extractJson, generateFlow, summarizeChanges, type ModelAdapter } from '../src/index.js';

const start = defineNode({ kind: 'test.start', title: 'Start', description: 'Starts the flow.', trigger: true, category: 'triggers' });
const notify = defineNode({
	kind: 'test.notify',
	title: 'Notify',
	description: 'Sends a message.',
	config: { to: f.string({ label: 'To' }), message: f.text() }
});
const registry = createRegistry([start, notify]);

/** A model that replies with whatever the test scripted, in order. */
const scripted = (replies: string[]): ModelAdapter & { seen: { system: string; messages: { role: string; content: string }[] }[] } => {
	const seen: { system: string; messages: { role: string; content: string }[] }[] = [];
	return {
		name: 'scripted',
		seen,
		async complete(request) {
			seen.push({ system: request.system, messages: request.messages.map((message) => ({ ...message })) });
			return { text: replies[seen.length - 1] ?? replies.at(-1) ?? '', usage: { inputTokens: 10, outputTokens: 20 } };
		}
	};
};

const flowJson = (message: string, to = 'team@example.com') =>
	JSON.stringify({
		version: 1,
		name: 'Tell the team',
		nodes: [
			{ id: 'start', kind: 'test.start' },
			{ id: 'tell', kind: 'test.notify', config: { to, message } }
		],
		edges: [{ from: 'start', to: 'tell' }]
	});

describe('generateFlow', () => {
	it('returns a validated flow on the first try', async () => {
		const model = scripted([`Here you go:\n\`\`\`json\n${flowJson('Deployed')}\n\`\`\``]);
		const result = await generateFlow({ registry, model, prompt: 'Tell the team when a deploy finishes' });

		expect(result.ok).toBe(true);
		expect(result.flow?.nodes.map((node) => node.kind)).toEqual(['test.start', 'test.notify']);
		expect(result.attempts).toHaveLength(1);
		expect(result.attempts[0].usage).toEqual({ inputTokens: 10, outputTokens: 20 });
		expect(model.seen[0].system).toContain('`test.notify`');
		expect(model.seen[0].messages[0].content).toContain('Tell the team when a deploy finishes');
	});

	it('feeds validation issues back until the flow is valid', async () => {
		const broken = JSON.stringify({
			version: 1,
			name: 'Broken',
			nodes: [
				{ id: 'start', kind: 'test.start' },
				{ id: 'tell', kind: 'test.notify', config: { message: 'hi' } }
			],
			edges: [{ from: 'start', to: 'tell' }]
		});
		const onAttempt = vi.fn();
		const model = scripted([broken, flowJson('hi')]);
		const result = await generateFlow({ registry, model, prompt: 'Tell the team', onAttempt });

		expect(result.ok).toBe(true);
		expect(result.attempts).toHaveLength(2);
		expect(onAttempt).toHaveBeenCalledTimes(2);
		const repair = model.seen[1].messages.at(-1)!.content;
		expect(repair).toContain('nodes[1].config.to');
		expect(repair).toContain('required');
	});

	it('gives up after maxRepairs and keeps the closest attempt', async () => {
		const model = scripted(['not json at all']);
		const result = await generateFlow({ registry, model, prompt: 'Tell the team', maxRepairs: 1 });

		expect(result.ok).toBe(false);
		expect(result.flow).toBeNull();
		expect(result.attempts).toHaveLength(2);
		expect(model.seen[1].messages.at(-1)!.content).toContain('not a JSON object');
	});

	it('mentions excluded steps and extra instructions in the system prompt', () => {
		const prompt = buildSystemPrompt(registry, { exclude: ['test.notify'], instructions: 'Prefer short ids.' });
		expect(prompt).toContain('Do not use these steps: `test.notify`');
		expect(prompt).toContain('Prefer short ids.');
		expect(prompt).toContain('# Flow format');
	});
});

describe('explainFlow', () => {
	it('asks in prose, with the catalog and the flow', async () => {
		const model = scripted(['  It waits for a manual run, then emails the team.  ']);
		const flow = registry.parse(JSON.parse(flowJson('Deployed'))).flow!;
		const result = await explainFlow({ registry, model, flow });

		expect(result.text).toBe('It waits for a manual run, then emails the team.');
		expect(result.model).toBe('scripted');
		expect(model.seen[0].system).toContain('no JSON, no code fences');
		expect(model.seen[0].system).toContain('`test.notify`');
		expect(model.seen[0].messages[0].content).toContain('"kind": "test.notify"');
		expect(model.seen[0].messages[0].content).toContain('What does this flow do?');
	});

	it('answers a specific question instead', async () => {
		const model = scripted(['Nothing is sent twice.']);
		const flow = registry.parse(JSON.parse(flowJson('Deployed'))).flow!;
		await explainFlow({ registry, model, flow, question: 'Can this send the same message twice?' });
		expect(model.seen[0].messages[0].content).toContain('Can this send the same message twice?');
	});
});

describe('editFlow', () => {
	it('reports what changed', async () => {
		const before = registry.parse(JSON.parse(flowJson('Deployed'))).flow!;
		const model = scripted([flowJson('Deployed to production', 'ops@example.com')]);
		const result = await editFlow({ registry, model, flow: before, instruction: 'Send it to ops instead' });

		expect(result.ok).toBe(true);
		expect(result.changes).toEqual([{ type: 'step:changed', id: 'tell', kind: 'test.notify', fields: ['config'] }]);
		expect(model.seen[0].messages[0].content).toContain('Send it to ops instead');
		expect(model.seen[0].messages[0].content).toContain('"kind": "test.notify"');
	});
});

describe('diffFlows', () => {
	const base = registry.parse(JSON.parse(flowJson('hi'))).flow!;

	it('sees added, removed and changed steps, connections and notes', () => {
		const after: Flow = {
			...base,
			name: 'Renamed',
			nodes: [base.nodes[0], { ...base.nodes[1], label: 'Ping ops' }, { id: 'extra', kind: 'test.notify', config: { to: 'a', message: 'b' } }],
			edges: [],
			annotations: [{ id: 'why', text: 'Deploy notice', position: { x: 0, y: 0 } }]
		};
		const changes = diffFlows(base, after);

		expect(changes).toContainEqual({ type: 'step:added', id: 'extra', kind: 'test.notify' });
		expect(changes).toContainEqual({ type: 'step:changed', id: 'tell', kind: 'test.notify', fields: ['label'] });
		expect(changes).toContainEqual({ type: 'edge:removed', id: 'start:out->tell', from: 'start', port: 'out', to: 'tell' });
		expect(changes).toContainEqual({ type: 'note:added', id: 'why' });
		expect(changes).toContainEqual({ type: 'flow:changed', fields: ['name'] });
		expect(summarizeChanges(changes)).toBe('2 added, 2 changed, 1 removed');
	});

	it('ignores positions', () => {
		const moved: Flow = { ...base, nodes: base.nodes.map((node) => ({ ...node, position: { x: 999, y: 999 } })) };
		expect(diffFlows(base, moved)).toEqual([]);
		expect(summarizeChanges([])).toBe('no changes');
	});
});

describe('extractJson', () => {
	it('reads JSON from fences, prose and braces inside strings', () => {
		expect(extractJson('```json\n{ "a": 1 }\n```')).toEqual({ a: 1 });
		expect(extractJson('Sure! { "a": { "b": 2 } } Hope that helps.')).toEqual({ a: { b: 2 } });
		expect(extractJson('{ "text": "a } b", "n": 3 }')).toEqual({ text: 'a } b', n: 3 });
		expect(extractJson('no json here')).toBeNull();
		expect(extractJson('{ broken')).toBeNull();
	});
});
