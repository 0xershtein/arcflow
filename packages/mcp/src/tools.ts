import { applyPatch, createEngine, hasErrors, toManifest, type Flow, type PatchOp, type Registry, type RunState, type Services } from '@arcflow/core';
import type { ToolDefinition, ToolOutcome } from './protocol.js';

/** Where flows are stored and run. Without one, only the catalog and validation tools work. */
export interface FlowStore {
	listFlows(): Promise<{ id: string; name: string; active: boolean; version: number }[]>;
	getFlow(id: string): Promise<{ id: string; name: string; active: boolean; version: number; flow: Flow }>;
	saveFlow(input: { id?: string; flow: Flow; active?: boolean }): Promise<{ id: string; name: string; version: number; active: boolean }>;
	startRun(id: string, options: { payload?: unknown; mode: 'live' | 'simulate' }): Promise<{ id: string; status: string }>;
	getRun(id: string): Promise<{ id: string; status: string; state: RunState }>;
}

export interface ToolContext {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	registry: Registry<any>;
	/** A running arcflow server. Optional: flows can still be written and validated without one. */
	store?: FlowStore;
	/** Services for local test runs. */
	services?: Services;
}

export interface Tool extends ToolDefinition {
	run(args: Record<string, unknown>, context: ToolContext): Promise<ToolOutcome> | ToolOutcome;
	/** Needs a server. */
	remote?: boolean;
}

const object = (properties: Record<string, unknown>, required: string[] = []) => ({
	type: 'object',
	properties,
	...(required.length ? { required } : {}),
	additionalProperties: false
});

const text = (description: string) => ({ type: 'string', description });
const FLOW_ARG = { type: 'object', description: 'The flow as JSON: { version: 1, name, nodes, edges }.' };

const asFlow = (value: unknown, context: ToolContext) => {
	const parsed = context.registry.parse(value);
	return parsed;
};

const issueLines = (issues: { level: string; path: string; message: string; code: string }[]) =>
	issues.map((issue) => `- [${issue.level}] ${issue.path || '(flow)'}: ${issue.message} (${issue.code})`).join('\n');

const summarizeRun = (state: RunState) => {
	const steps = Object.entries(state.steps)
		.map(([key, step]) => `- ${key}: ${step.status}${step.message ? ` — ${step.message}` : ''}${step.error ? ` — ${step.error}` : ''}`)
		.join('\n');
	return `Run ${state.id} is ${state.status}.${state.error ? `\nError: ${state.error.message}` : ''}\n${steps}`;
};

export const tools: Tool[] = [
	{
		name: 'list_steps',
		description:
			'The steps flows can be built from: kinds, settings, outputs and what each one does. Read this before writing a flow. Returns Markdown, plus the machine-readable catalog.',
		inputSchema: object({ search: text('Only steps matching this text.') }),
		run(args, { registry }) {
			const search = typeof args.search === 'string' ? args.search.toLowerCase() : '';
			const manifest = toManifest(registry);
			const steps = search
				? manifest.steps.filter((step) => `${step.kind} ${step.title} ${step.description}`.toLowerCase().includes(search))
				: manifest.steps;
			return {
				text: search
					? `${steps.length} of ${manifest.steps.length} steps match “${search}”:\n\n${steps.map((step) => `- \`${step.kind}\` — ${step.title}: ${step.description}`).join('\n')}`
					: registry.describe(),
				data: { steps, categories: manifest.categories }
			};
		}
	},
	{
		name: 'validate_flow',
		description: 'Checks a flow against the step catalog without saving it. Returns the problems with their JSON paths, and the flow with defaults filled in.',
		inputSchema: object({ flow: FLOW_ARG }, ['flow']),
		run(args, context) {
			const parsed = asFlow(args.flow, context);
			if (!parsed.flow) return { text: `Not a flow:\n${issueLines(parsed.issues)}`, isError: true };
			return {
				text: parsed.issues.length ? `${parsed.ok ? 'Valid, with warnings' : 'Not valid yet'}:\n${issueLines(parsed.issues)}` : 'Valid. Every step is connected and configured.',
				data: { ok: parsed.ok, issues: parsed.issues, flow: parsed.flow }
			};
		}
	},
	{
		name: 'patch_flow',
		description:
			'Changes part of a flow without rewriting it. Operations: set and remove take the same path a validation issue reports (nodes[1].config.url, or nodes[fetch].config.url by id); addNode, removeNode, connect and disconnect handle the wiring. All or nothing — if one operation fails, nothing is applied. Returns the patched flow and what validation says about it.',
		inputSchema: object(
			{
				flow: FLOW_ARG,
				operations: {
					type: 'array',
					description:
						'In order. { "op": "set", "path": "nodes[fetch].config.url", "value": "https://…" } · { "op": "remove", "path": … } · { "op": "addNode", "node": { "id", "kind", "config" }, "after": "<step id>", "port": "out" } · { "op": "removeNode", "id": … } · { "op": "connect", "from", "to", "port" } · { "op": "disconnect", "from", "to", "port" }',
					items: { type: 'object' }
				}
			},
			['flow', 'operations']
		),
		run(args, context) {
			const parsed = asFlow(args.flow, context);
			if (!parsed.flow) return { text: `Not a flow:\n${issueLines(parsed.issues)}`, isError: true };
			if (!Array.isArray(args.operations) || args.operations.length === 0) {
				return { text: 'Give at least one operation.', isError: true };
			}
			const result = applyPatch(parsed.flow, args.operations as PatchOp[]);
			if (!result.applied) {
				const lines = result.failures.map((failure) => `- operation ${failure.index} (${failure.op.op}): ${failure.message}`).join('\n');
				return { text: `Nothing was applied:\n${lines}`, data: { applied: false, failures: result.failures }, isError: true };
			}
			const issues = context.registry.validate(result.flow);
			const ok = !hasErrors(issues);
			return {
				text: `Applied ${args.operations.length} operation${args.operations.length === 1 ? '' : 's'}. ${
					issues.length ? `${ok ? 'Valid, with warnings' : 'Not valid yet'}:\n${issueLines(issues)}` : 'The flow is valid.'
				}`,
				data: { applied: true, ok, issues, flow: result.flow }
			};
		}
	},
	{
		name: 'test_flow',
		description:
			'Runs a flow here in simulate mode: steps report what they would do without sending anything. Use it to check a flow before saving it. Returns every step, its status and its output.',
		inputSchema: object({ flow: FLOW_ARG, payload: { description: 'Trigger payload for the run.' } }, ['flow']),
		async run(args, context) {
			const parsed = asFlow(args.flow, context);
			if (!parsed.flow || hasErrors(parsed.issues)) {
				return { text: `Fix the flow first:\n${issueLines(parsed.issues)}`, isError: true };
			}
			const state = await createEngine(context.registry, { services: context.services }).start(parsed.flow, {
				mode: 'simulate',
				...(args.payload === undefined ? {} : { payload: args.payload })
			});
			return { text: summarizeRun(state), data: state };
		}
	},
	{
		name: 'list_flows',
		description: 'The flows saved on the server, with their id, version and whether they are active.',
		inputSchema: object({}),
		remote: true,
		async run(_args, { store }) {
			const flows = await store!.listFlows();
			return {
				text: flows.length ? flows.map((flow) => `- ${flow.id} — ${flow.name} (v${flow.version}, ${flow.active ? 'active' : 'paused'})`).join('\n') : 'No flows yet.',
				data: flows
			};
		}
	},
	{
		name: 'get_flow',
		description: 'One saved flow as JSON, with its current problems.',
		inputSchema: object({ id: text('Flow id.') }, ['id']),
		remote: true,
		async run(args, { store, registry }) {
			const record = await store!.getFlow(String(args.id));
			const issues = registry.validate(record.flow);
			return { text: JSON.stringify(record.flow, null, 2), data: { ...record, issues } };
		}
	},
	{
		name: 'save_flow',
		description:
			'Saves a flow to the server: creates it without an id, or saves a new version of an existing one. Set active to let webhooks and schedules trigger it (only possible without errors).',
		inputSchema: object(
			{
				flow: FLOW_ARG,
				id: text('Existing flow id. Leave out to create a new flow.'),
				active: { type: 'boolean', description: 'Whether the flow answers webhooks and schedules.' }
			},
			['flow']
		),
		remote: true,
		async run(args, context) {
			const parsed = asFlow(args.flow, context);
			if (!parsed.flow) return { text: `Not a flow:\n${issueLines(parsed.issues)}`, isError: true };
			if (args.active === true && hasErrors(parsed.issues)) {
				return { text: `Fix the errors before activating:\n${issueLines(parsed.issues)}`, isError: true };
			}
			const saved = await context.store!.saveFlow({
				flow: parsed.flow,
				...(typeof args.id === 'string' ? { id: args.id } : {}),
				...(typeof args.active === 'boolean' ? { active: args.active } : {})
			});
			return {
				text: `Saved “${saved.name}” as ${saved.id} (v${saved.version}, ${saved.active ? 'active' : 'paused'}).${parsed.issues.length ? `\nWarnings:\n${issueLines(parsed.issues)}` : ''}`,
				data: { ...saved, issues: parsed.issues }
			};
		}
	},
	{
		name: 'run_flow',
		description: 'Runs a saved flow on the server. Live runs really send requests and make changes; simulate runs do not.',
		inputSchema: object(
			{
				id: text('Flow id.'),
				payload: { description: 'Trigger payload.' },
				mode: { type: 'string', enum: ['live', 'simulate'], description: 'Default simulate.' }
			},
			['id']
		),
		remote: true,
		async run(args, { store }) {
			const run = await store!.startRun(String(args.id), {
				mode: args.mode === 'live' ? 'live' : 'simulate',
				...(args.payload === undefined ? {} : { payload: args.payload })
			});
			return { text: `Run ${run.id} is ${run.status}. Read it with get_run.`, data: run };
		}
	},
	{
		name: 'get_run',
		description: 'A run on the server: its status, every step, their outputs and any error.',
		inputSchema: object({ id: text('Run id.') }, ['id']),
		remote: true,
		async run(args, { store }) {
			const run = await store!.getRun(String(args.id));
			return { text: summarizeRun(run.state), data: run };
		}
	}
];

export const toolsFor = (context: ToolContext) => tools.filter((tool) => !tool.remote || context.store);
