import { mount, unmount } from 'svelte';
import type { Flow, Issue } from '@arcflow/core';
import FlowEditor from './FlowEditor.svelte';
import type { EditorOptions } from './options.js';
import styles from './styles.js';

export interface CreateEditorOptions extends EditorOptions {
	/** Add the editor's CSS to the page (or shadow root) automatically. Default `true`. */
	injectStyles?: boolean;
}

export interface EditorInstance {
	/** The current flow as plain JSON. */
	getFlow(): Flow;
	/** Replaces the flow. Resolves with parse issues; `loaded` is false for input that is not a flow at all. */
	setFlow(flow: Flow | string): Promise<{ loaded: boolean; issues: Issue[] }>;
	/** Current problems (errors and warnings). */
	getIssues(): Issue[];
	/** Updates options in place — theme, ui, labels, readonly, callbacks. `steps` cannot change. */
	setOptions(options: Partial<Omit<EditorOptions, 'steps'>>): void;
	/** Starts a simulated run on the canvas, or stops the one in progress. */
	run(): Promise<void>;
	/** Removes the editor from the page. */
	destroy(): void;
}

const STYLE_ID = 'arcflow-editor-styles';

function injectStyles(target: HTMLElement) {
	const root = target.getRootNode();
	const host = root instanceof ShadowRoot ? root : document.head;
	if (host.querySelector(`#${STYLE_ID}`)) return;
	const style = document.createElement('style');
	style.id = STYLE_ID;
	style.textContent = styles;
	host.appendChild(style);
}

const OPTION_KEYS = [
	'steps',
	'flow',
	'theme',
	'ui',
	'labels',
	'readonly',
	'storageKey',
	'services',
	'runStepDelay',
	'onChange',
	'onValidate',
	'onSelect',
	'onRun'
] as const satisfies readonly (keyof EditorOptions)[];

/**
 * Mounts the flow editor into an element. Works with any framework or none.
 * The element should have a height; the editor fills it.
 *
 *   const editor = createEditor('#editor', { steps: registry, flow, onChange: save });
 */
export function createEditor(target: HTMLElement | string, options: CreateEditorOptions): EditorInstance {
	const element = typeof target === 'string' ? document.querySelector<HTMLElement>(target) : target;
	if (!element) throw new Error(`createEditor: no element matches "${String(target)}".`);

	const { injectStyles: inject = true, ...initial } = options;
	if (inject) injectStyles(element);

	// Options live in a raw signal so registries and flows are passed through untouched (no deep proxies).
	let current = $state.raw<EditorOptions>(initial);
	const props = {} as EditorOptions;
	for (const key of OPTION_KEYS) {
		Object.defineProperty(props, key, { enumerable: true, get: () => current[key] });
	}

	const component = mount(FlowEditor, { target: element, props });

	return {
		getFlow: () => component.getFlow(),
		setFlow: (flow) => component.load(flow),
		getIssues: () => component.getIssues(),
		setOptions: (next) => {
			current = { ...current, ...next, steps: current.steps };
		},
		run: () => component.run(),
		destroy: () => {
			unmount(component);
		}
	};
}
