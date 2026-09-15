import { hasErrors, type Flow, type Issue, type Registry } from '@arcflow/core';
import type { ModelAdapter, ModelMessage } from './model.js';
import { buildSystemPrompt, describeEdit, describeTask, extractJson, issuesMessage, type PromptOptions } from './prompt.js';

export interface GenerateOptions extends PromptOptions {
	/** The steps the flow may use. */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	registry: Registry<any>;
	model: ModelAdapter;
	/** What the flow should do, in plain language. */
	prompt: string;
	/** Run variables the flow can read as `{{ vars.name }}`. */
	vars?: Record<string, unknown>;
	/** Extra tries after the first, each with the validation issues fed back. Default 2. */
	maxRepairs?: number;
	maxTokens?: number;
	signal?: AbortSignal;
	/** Called after every model reply, before the next repair. */
	onAttempt?: (attempt: Attempt) => void;
}

export interface Attempt {
	/** 1 for the first try, 2 for the first repair, and so on. */
	number: number;
	/** The model's raw reply. */
	text: string;
	flow: Flow | null;
	issues: Issue[];
	usage?: { inputTokens?: number; outputTokens?: number };
}

export interface GenerateResult {
	/** True when the flow has no errors left. */
	ok: boolean;
	/** The best flow the model produced, or null if it never returned one. */
	flow: Flow | null;
	issues: Issue[];
	attempts: Attempt[];
	model: string;
}

const NOT_JSON = 'Your reply was not a JSON object. Reply with the flow as one JSON object and nothing else.';

/** Asks the model for a flow, then repairs it until it validates (or the tries run out). */
async function run(
	options: GenerateOptions,
	first: string,
	flowOf: (value: unknown) => unknown = (value) => value
): Promise<GenerateResult> {
	const { registry, model, maxRepairs = 2 } = options;
	const system = buildSystemPrompt(registry, options);
	const messages: ModelMessage[] = [{ role: 'user', content: first }];
	const attempts: Attempt[] = [];
	let best: Attempt | undefined;

	for (let number = 1; number <= maxRepairs + 1; number++) {
		const reply = await model.complete({
			system,
			messages,
			...(options.maxTokens === undefined ? {} : { maxTokens: options.maxTokens }),
			...(options.signal ? { signal: options.signal } : {})
		});
		const json = flowOf(extractJson(reply.text));
		const parsed = json === null || json === undefined ? null : registry.parse(json);
		const attempt: Attempt = {
			number,
			text: reply.text,
			flow: parsed?.flow ?? null,
			issues: parsed?.issues ?? [],
			...(reply.usage ? { usage: reply.usage } : {})
		};
		attempts.push(attempt);
		options.onAttempt?.(attempt);

		if (parsed?.ok) return { ok: true, flow: attempt.flow, issues: attempt.issues, attempts, model: model.name };
		// Keep the attempt that got furthest: a flow with issues beats no flow at all.
		if (!best?.flow || (attempt.flow && attempt.issues.length < best.issues.length)) best = attempt;

		messages.push({ role: 'assistant', content: reply.text });
		messages.push({ role: 'user', content: parsed ? issuesMessage(parsed.issues) : NOT_JSON });
	}

	return {
		ok: false,
		flow: best?.flow ?? null,
		issues: best?.issues ?? [],
		attempts,
		model: model.name
	};
}

/**
 * Builds a flow from a description, checking it against the registry and asking the model
 * to fix whatever the validation found.
 *
 *   const { ok, flow, issues } = await generateFlow({
 *     registry: standardRegistry,
 *     model: anthropicModel(),
 *     prompt: 'Every Monday, fetch open invoices and tell the team in Slack'
 *   });
 */
export function generateFlow(options: GenerateOptions): Promise<GenerateResult> {
	return run(options, describeTask(options.prompt, options.vars));
}

export interface EditOptions extends Omit<GenerateOptions, 'prompt'> {
	/** The flow to change. */
	flow: Flow;
	/** What to change, in plain language. */
	instruction: string;
}

export interface EditResult extends GenerateResult {
	/** What the model changed, for a diff the user can accept or reject. */
	changes: FlowChange[];
}

/** Changes an existing flow and reports what moved. */
export async function editFlow(options: EditOptions): Promise<EditResult> {
	const result = await run({ ...options, prompt: options.instruction }, describeEdit(options.flow, options.instruction));
	return { ...result, changes: result.flow ? diffFlows(options.flow, result.flow) : [] };
}

export type FlowChange =
	| { type: 'step:added'; id: string; kind: string; title?: string }
	| { type: 'step:removed'; id: string; kind: string }
	| { type: 'step:changed'; id: string; kind: string; fields: string[] }
	| { type: 'edge:added'; id: string; from: string; port: string; to: string }
	| { type: 'edge:removed'; id: string; from: string; port: string; to: string }
	| { type: 'note:added'; id: string }
	| { type: 'note:removed'; id: string }
	| { type: 'flow:changed'; fields: string[] };

const changedFields = (before: Record<string, unknown>, after: Record<string, unknown>) =>
	[...new Set([...Object.keys(before), ...Object.keys(after)])]
		.filter((key) => key !== 'position' && JSON.stringify(before[key]) !== JSON.stringify(after[key]))
		.sort();

/** What changed between two flows. Positions are ignored; they are layout, not meaning. */
export function diffFlows(before: Flow, after: Flow): FlowChange[] {
	const changes: FlowChange[] = [];
	const oldNodes = new Map(before.nodes.map((node) => [node.id, node]));
	const newNodes = new Map(after.nodes.map((node) => [node.id, node]));

	for (const [id, node] of newNodes) {
		const old = oldNodes.get(id);
		if (!old) {
			changes.push({ type: 'step:added', id, kind: node.kind, ...(node.label ? { title: node.label } : {}) });
			continue;
		}
		const fields = changedFields(
			{ kind: old.kind, label: old.label, config: old.config, disabled: old.disabled, join: old.join },
			{ kind: node.kind, label: node.label, config: node.config, disabled: node.disabled, join: node.join }
		);
		if (fields.length) changes.push({ type: 'step:changed', id, kind: node.kind, fields });
	}
	for (const [id, node] of oldNodes) if (!newNodes.has(id)) changes.push({ type: 'step:removed', id, kind: node.kind });

	const oldEdges = new Map(before.edges.map((edge) => [edge.id, edge]));
	const newEdges = new Map(after.edges.map((edge) => [edge.id, edge]));
	for (const [id, edge] of newEdges) {
		if (!oldEdges.has(id)) changes.push({ type: 'edge:added', id, from: edge.from, port: edge.port, to: edge.to });
	}
	for (const [id, edge] of oldEdges) {
		if (!newEdges.has(id)) changes.push({ type: 'edge:removed', id, from: edge.from, port: edge.port, to: edge.to });
	}

	const oldNotes = new Set((before.annotations ?? []).map((note) => note.id));
	const newNotes = new Set((after.annotations ?? []).map((note) => note.id));
	for (const id of newNotes) if (!oldNotes.has(id)) changes.push({ type: 'note:added', id });
	for (const id of oldNotes) if (!newNotes.has(id)) changes.push({ type: 'note:removed', id });

	const meta = changedFields(
		{ name: before.name, description: before.description, vars: before.vars },
		{ name: after.name, description: after.description, vars: after.vars }
	);
	if (meta.length) changes.push({ type: 'flow:changed', fields: meta });
	return changes;
}

/** A one-line summary of a diff, for a prompt bar or a commit message. */
export function summarizeChanges(changes: FlowChange[]): string {
	const counts = { added: 0, removed: 0, changed: 0 };
	for (const change of changes) {
		if (change.type.endsWith(':added')) counts.added++;
		else if (change.type.endsWith(':removed')) counts.removed++;
		else counts.changed++;
	}
	const parts = [
		counts.added ? `${counts.added} added` : '',
		counts.changed ? `${counts.changed} changed` : '',
		counts.removed ? `${counts.removed} removed` : ''
	].filter(Boolean);
	return parts.length ? parts.join(', ') : 'no changes';
}

/** True when the model only returned issues the editor can live with (warnings). */
export const isUsable = (result: GenerateResult) => Boolean(result.flow) && !hasErrors(result.issues);
