/**
 * Plain helpers behind what the toolbar, the problems panel and the run log say.
 * They are framework-free on purpose: the components read them, and the tests read them too.
 */
import type { AnyNodeDefinition, FlowNode, Issue } from '@arcflow/core';
import { isDev } from './dev.js';
import { format, type EditorOptions, type Labels } from './options.js';

export type FlowStatus = 'empty' | 'errors' | 'notes' | 'ready';

export interface FlowSummary {
	errors: number;
	/** Warnings — problems the flow still runs with. */
	notes: number;
	/** `empty` is a flow with no steps yet: guidance, not a problem. */
	status: FlowStatus;
}

/**
 * One count of the flow's problems for every surface that shows them, so the toolbar badge and the
 * panel can never disagree: errors first, warnings only when there are no errors, and a flow with
 * no steps yet is neither.
 */
export function summarize(issues: readonly Issue[], stepCount: number): FlowSummary {
	const errors = issues.filter((issue) => issue.level === 'error').length;
	const notes = issues.filter((issue) => issue.level === 'warning').length;
	// A flow with no steps yet is being started, not broken: it reports as guidance, not as a problem.
	const status: FlowStatus = stepCount === 0 ? 'empty' : errors ? 'errors' : notes ? 'notes' : 'ready';
	return { errors, notes, status };
}

/** What the toolbar badge reads: "2 problems", "2 notes", "Start with a trigger" or "Ready". */
export function statusText(summary: FlowSummary, labels: Labels): string {
	switch (summary.status) {
		case 'errors':
			return format(summary.errors === 1 ? labels.problemCount : labels.problemsCount, { count: summary.errors });
		case 'notes':
			return format(summary.notes === 1 ? labels.noteCount : labels.notesCount, { count: summary.notes });
		case 'empty':
			return labels.emptyTitle;
		default:
			return labels.ready;
	}
}

/** Title of the problems panel, from the same summary as the badge. */
export function statusTitle(summary: FlowSummary, labels: Labels): string {
	switch (summary.status) {
		case 'errors':
			return labels.needsAttention;
		case 'notes':
			return statusText(summary, labels);
		case 'empty':
			return labels.emptyTitle;
		default:
			return labels.looksGood;
	}
}

/**
 * How a run was made: on the canvas, on the server in simulate mode, or on the server for real.
 * The run log says which, because "nothing was sent" is only true of some of them.
 */
export type RunKind = 'test' | 'test-server' | 'live';

export interface RunHeader {
	title: string;
	note: string;
	/** Steps really happened: worth a different accent. */
	live: boolean;
}

/**
 * `ran` is how many steps of a finished simulation had no test mode and therefore did the real thing.
 * Pass `null` while a run is still going or when the steps cannot be counted (a catalog that does not
 * say which steps can pretend), and the header keeps the general warning instead of a number.
 */
export function runHeader(mode: RunKind, labels: Labels, ran: number | null = null): RunHeader {
	if (mode === 'live') return { title: labels.liveRunTitle, note: labels.ranOnServer, live: true };
	const note =
		ran === null
			? mode === 'test-server'
				? labels.simulatedOnServer
				: labels.simulated
			: ran === 0
				? labels.simulatedNothing
				: ran === 1
					? labels.simulatedOneRan
					: format(labels.simulatedRan, { count: ran });
	return { title: labels.runTitle, note, live: false };
}

/** Kinds whose override has already been reported, so one broken summary is not one warning per frame. */
const reportedSummaries = new Set<string>();

/**
 * What a step says it will do: the host's override for that kind, else the definition's own summary,
 * else its description. A summary is written by someone else and runs on half-finished config, so a
 * throw from one falls back rather than taking the canvas with it — and says so once, while
 * developing, because a summary that silently never appears is hard to go looking for.
 */
export function stepSummary(
	def: AnyNodeDefinition,
	config: Record<string, unknown>,
	overrides?: EditorOptions['summaries'],
	node?: FlowNode
): string {
	const override = overrides?.[def.kind];
	if (override) {
		try {
			const text = override(config, def, node ?? { id: def.kind, kind: def.kind, config });
			if (typeof text === 'string' && text) return text;
		} catch (error) {
			if (isDev && !reportedSummaries.has(def.kind)) {
				reportedSummaries.add(def.kind);
				console.warn(`[arcflow] The summary for "${def.kind}" threw, so the step's own wording is used instead:`, error);
			}
		}
	}
	try {
		return def.summary?.(config) ?? def.description;
	} catch {
		return def.description;
	}
}

/** `1234` → `1.2s`, `65_000` → `1m 5s`. Short enough for a run row. */
export function formatDuration(ms: number): string {
	const total = Math.max(0, Math.round(ms));
	if (total < 1000) return `${total}ms`;
	const seconds = total / 1000;
	if (seconds < 10) return `${Math.round(seconds * 10) / 10}s`;
	if (seconds < 60) return `${Math.round(seconds)}s`;
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes}m ${Math.round(seconds % 60)}s`;
	return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

/** ISO date and time, anywhere inside a longer string. */
const ISO = /\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?/g;

export const localTime = (at: number | Date) =>
	new Date(at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

/**
 * Rewrites machine timestamps inside a message into local time, so a step that reports
 * `Waiting until 2026-09-20T09:31:01.551Z` reads like the times next to it.
 */
export function withLocalTimes(text: string, at: (date: Date) => string = localTime): string {
	return text.replace(ISO, (match) => {
		const value = Date.parse(match);
		return Number.isFinite(value) ? at(new Date(value)) : match;
	});
}
