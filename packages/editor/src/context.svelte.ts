import { getContext, setContext } from 'svelte';
import type { Issue, Registry, RunState } from '@arcflow/core';
import type { Backend, ServerCredential } from './backend.js';
import type { Labels, ResolvedUi } from './options.js';

export type StepRunStatus = 'running' | 'success' | 'waiting' | 'error' | 'skipped';

/** An expression path offered while typing inside `{{ }}`. */
export interface Suggestion {
	path: string;
	detail?: string;
}

/** dataTransfer type used when dragging a step from the palette onto the canvas. */
export const DRAG_TYPE = 'application/x-arcflow-kind';

/** dataTransfer type used when dragging a value from run data onto a field. Carries `{{ path }}`. */
export const EXPRESSION_DRAG = 'application/x-arcflow-expression';

const KEY = Symbol('arcflow-editor');

/** Editor-wide state that child components read through context. */
export class EditorState {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	readonly registry: Registry<any>;
	labels = $state.raw<Labels>() as Labels;
	ui = $state.raw<ResolvedUi>() as ResolvedUi;
	readonly = $state(false);
	runStatus = $state<Record<string, { status: StepRunStatus; message?: string }>>({});
	issuesByNode = $state<Record<string, Issue[]>>({});
	/** The most recent test run, used to inspect step data, suggest expressions and preview them. */
	lastRun = $state.raw<RunState | null>(null);
	/** Opens the step picker to insert a step into a connection (screen coordinates). Set by the workspace. */
	onInsert: ((edgeId: string, clientX: number, clientY: number) => void) | null = null;
	/** The flow server, when the editor runs in server mode. */
	backend = $state.raw<Backend | null>(null);
	/** Credentials on the server, for `f.credential` fields. */
	credentials = $state.raw<ServerCredential[]>([]);
	/** Set when the server has no secret configured, so credentials cannot be stored. */
	credentialsOff = $state(false);
	/** Asks the workspace to store a new credential of this type; resolves with its id. */
	onCreateCredential: ((type: string, name: string, value: unknown) => Promise<string | null>) | null = null;

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	constructor(registry: Registry<any>, labels: Labels, ui: ResolvedUi, readonly: boolean) {
		this.registry = registry;
		this.labels = labels;
		this.ui = ui;
		this.readonly = readonly;
	}
}

export const setEditor = (state: EditorState) => setContext(KEY, state);
export const getEditor = () => getContext<EditorState>(KEY);
