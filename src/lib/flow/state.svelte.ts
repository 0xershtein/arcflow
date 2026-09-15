import { getContext, setContext } from 'svelte';
import type { Registry } from './registry';
import type { StepStatus } from './runner';
import type { Issue } from './validate';

const KEY = Symbol('flow-builder');

/** dataTransfer type used when dragging a step from the palette onto the canvas. */
export const DRAG_TYPE = 'application/x-flow-kind';

/** Editor-wide state that custom node components read through context. */
export class BuilderState {
	readonly registry: Registry;
	runStatus = $state<Record<string, { status: StepStatus; message?: string }>>({});
	issuesByNode = $state<Record<string, Issue[]>>({});

	constructor(registry: Registry) {
		this.registry = registry;
	}
}

export const setBuilder = (state: BuilderState) => setContext(KEY, state);
export const getBuilder = () => getContext<BuilderState>(KEY);
