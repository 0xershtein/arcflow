import { getContext, setContext } from 'svelte';
import type { Issue, Registry } from '@arcflow/core';
import type { Labels, ResolvedUi } from './options.js';

export type StepRunStatus = 'running' | 'success' | 'waiting' | 'error' | 'skipped';

/** dataTransfer type used when dragging a step from the palette onto the canvas. */
export const DRAG_TYPE = 'application/x-arcflow-kind';

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
