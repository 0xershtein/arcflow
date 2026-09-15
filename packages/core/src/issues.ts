export type IssueLevel = 'error' | 'warning';

export type IssueCode =
	| 'invalid_document'
	| 'invalid_type'
	| 'required'
	| 'too_small'
	| 'too_big'
	| 'invalid_enum'
	| 'invalid_pattern'
	| 'unknown_key'
	| 'duplicate_id'
	| 'unknown_kind'
	| 'unknown_node'
	| 'unknown_port'
	| 'no_trigger'
	| 'trigger_input'
	| 'disconnected'
	| 'unreachable'
	| 'cycle'
	| 'missing_upstream'
	| 'check_failed'
	| 'unknown_reference'
	| 'invalid_expression'
	| 'loop_body_escape';

/**
 * A problem found while parsing or validating a flow.
 * `code` is stable and `path` points into the flow JSON (e.g. `nodes[2].config.threshold`),
 * so programs and LLMs can repair flows without parsing messages.
 */
export interface Issue {
	level: IssueLevel;
	code: IssueCode;
	message: string;
	path: string;
	nodeId?: string;
	edgeId?: string;
}

export class FlowError extends Error {
	readonly issues: Issue[];

	constructor(message: string, issues: Issue[]) {
		super(message);
		this.name = 'FlowError';
		this.issues = issues;
	}
}

export const hasErrors = (issues: readonly Issue[]) => issues.some((issue) => issue.level === 'error');

export function formatIssues(issues: readonly Issue[]): string {
	return issues.map((issue) => `- [${issue.level}] ${issue.code} at ${issue.path || '(flow)'}: ${issue.message}`).join('\n');
}
