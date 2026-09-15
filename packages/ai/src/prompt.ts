import type { AnyNodeDefinition, Flow, Issue, Registry } from '@arcflow/core';

/** The rules a flow must follow, on top of the step catalog the registry describes. */
const RULES = `# How to answer

Reply with one JSON object and nothing else: no prose, no explanation, no code fence.

{ "version": 1, "name": "…", "description": "…", "nodes": [ … ], "edges": [ … ], "annotations": [ … ] }

Rules:
- Exactly one trigger step, with no incoming connection. Every other step must be reachable from it.
- Node ids are short and readable ("check-runway"); letters, digits, "-" and "_" only. Edges use them: { "from": "a", "port": "true", "to": "b" }.
- "port" is the output the connection leaves from. Leave it out when the step has a single output besides "error".
- Fill in every required setting. Leave optional ones out rather than guessing a value.
- Refer to earlier data with expressions: {{ steps.<id>.output.field }}, {{ input }}, {{ vars.name }}, {{ trigger.body }}, {{ $item }}, {{ $index }}.
  Filters go after a pipe: {{ steps.x.output.items | length }}, {{ total | round: 2 }}. A fallback goes after ??: {{ vars.to ?? "team@example.com" }}.
- Steps connected to a loop's "item" output run once per item and may only connect back inside the loop; "done" continues afterwards.
- "position" is optional — leave it out and the editor lays the flow out.
- Use "annotations" for short notes on the canvas: { "id": "why", "text": "…", "position": { "x": 0, "y": 0 } }.
- Never invent step kinds, ports or settings. Only what the catalog lists exists.`;

export interface PromptOptions {
	/** Extra instructions appended to the system prompt (house style, naming, defaults). */
	instructions?: string;
	/** Step kinds the model may not use. */
	exclude?: readonly string[];
}

/** The system prompt: the flow format, the rules, and the catalog of steps that exist. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildSystemPrompt(registry: Registry<any>, options: PromptOptions = {}): string {
	const catalog = registry.describe();
	const excluded = options.exclude?.length
		? `\nDo not use these steps: ${options.exclude.map((kind) => `\`${kind}\``).join(', ')}.`
		: '';
	return [
		'You build automation flows as JSON for arcflow. You are precise: a flow you return can be run without edits.',
		RULES + excluded,
		catalog,
		options.instructions?.trim() ?? ''
	]
		.filter(Boolean)
		.join('\n\n');
}

/** The system prompt for explaining a flow: same catalog, prose instead of JSON. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildExplainPrompt(registry: Registry<any>, options: PromptOptions = {}): string {
	return [
		'You explain automation flows to the person who has to run them. Be short and concrete: what starts it, what each step does with which data, where it branches, waits or can fail. Name steps the way the flow does. Plain prose or a short list — no JSON, no code fences.',
		registry.describe(),
		options.instructions?.trim() ?? ''
	]
		.filter(Boolean)
		.join('\n\n');
}

/** The first JSON object in a reply, tolerating code fences and stray prose. */
export function extractJson(text: string): unknown {
	const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
	const candidates = [fenced?.[1], text];
	for (const candidate of candidates) {
		if (!candidate) continue;
		const start = candidate.indexOf('{');
		if (start < 0) continue;
		// Walk to the matching brace so trailing prose does not break the parse.
		let depth = 0;
		let inString = false;
		let escaped = false;
		for (let i = start; i < candidate.length; i++) {
			const char = candidate[i];
			if (escaped) escaped = false;
			else if (char === '\\') escaped = true;
			else if (char === '"') inString = !inString;
			else if (!inString && char === '{') depth++;
			else if (!inString && char === '}' && --depth === 0) {
				try {
					return JSON.parse(candidate.slice(start, i + 1));
				} catch {
					break;
				}
			}
		}
	}
	return null;
}

const MAX_ISSUES = 20;

/** The repair message: what is wrong, in the model's own terms. */
export function issuesMessage(issues: Issue[]): string {
	const errors = issues.filter((issue) => issue.level === 'error');
	const shown = (errors.length ? errors : issues).slice(0, MAX_ISSUES);
	const lines = shown.map((issue) => `- ${issue.path || '(flow)'}: ${issue.message} [${issue.code}]`);
	const more = (errors.length ? errors : issues).length - shown.length;
	if (more > 0) lines.push(`- …and ${more} more.`);
	return `That flow has problems:\n${lines.join('\n')}\n\nFix every one and reply with the whole flow as JSON again.`;
}

/** The user message for a new flow. */
export function describeTask(prompt: string, sample?: Record<string, unknown>): string {
	const vars = sample && Object.keys(sample).length ? `\n\nVariables available as {{ vars.… }}: ${JSON.stringify(sample)}` : '';
	return `Build this flow:\n\n${prompt}${vars}`;
}

/** The user message for a change to an existing flow. */
export function describeEdit(flow: Flow, instruction: string): string {
	return [
		'Here is the current flow:',
		'```json',
		JSON.stringify(flow, null, 2),
		'```',
		'',
		`Change it: ${instruction}`,
		'',
		'Keep the ids of steps you do not change, keep their positions, and reply with the whole flow as JSON.'
	].join('\n');
}

/** Step kinds in a registry, for prompts that list what is available. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const stepKinds = (registry: Registry<any>): string[] => (registry.nodes as readonly AnyNodeDefinition[]).map((node) => node.kind);
