import type { Backend } from './backend.js';
import {
	createRegistry,
	type AnyNodeDefinition,
	type Flow,
	type FlowNode,
	type Issue,
	type Pack,
	type Registry,
	type RunEvent,
	type Services
} from '@arcflow/core';

export type ThemeMode = 'light' | 'dark' | 'auto';

/** Every color the editor uses. Any CSS color value works. */
export interface ThemeColors {
	/** Canvas and panel background. */
	background: string;
	/** Cards, inputs, menus. */
	surface: string;
	surfaceHover: string;
	surfaceActive: string;
	border: string;
	borderStrong: string;
	text: string;
	textSoft: string;
	textMuted: string;
	/** Selection, focus rings, active edges, icons. */
	accent: string;
	/** Translucent accent for glows and highlights. */
	accentSoft: string;
	/** Main buttons (Test run, Apply). */
	primary: string;
	primaryText: string;
	/** Runs that really happen: the live run log, its badge. */
	live: string;
	/** Translucent `live` for badges and glows. */
	liveSoft: string;
	danger: string;
	dangerSoft: string;
	/** Connection lines. */
	edge: string;
	/** Canvas dot / line pattern. */
	grid: string;
}

export const lightColors: ThemeColors = {
	background: '#f7f7f8',
	surface: '#ffffff',
	surfaceHover: '#f2f2f4',
	surfaceActive: '#e8e8ec',
	border: '#e4e4e7',
	borderStrong: '#d4d4d8',
	text: '#18181b',
	textSoft: '#3f3f46',
	textMuted: '#71717a',
	accent: '#4f46e5',
	accentSoft: 'rgba(79, 70, 229, 0.12)',
	primary: '#18181b',
	primaryText: '#ffffff',
	live: '#047857',
	liveSoft: 'rgba(4, 120, 87, 0.12)',
	danger: '#dc2626',
	dangerSoft: 'rgba(220, 38, 38, 0.1)',
	edge: '#a1a1aa',
	grid: '#d4d4d8'
};

export const darkColors: ThemeColors = {
	background: '#0f0f11',
	surface: '#18181b',
	surfaceHover: '#1f1f23',
	surfaceActive: '#27272a',
	border: '#27272a',
	borderStrong: '#3f3f46',
	text: '#fafafa',
	textSoft: '#d4d4d8',
	textMuted: '#a1a1aa',
	accent: '#818cf8',
	accentSoft: 'rgba(129, 140, 248, 0.16)',
	primary: '#fafafa',
	primaryText: '#18181b',
	live: '#34d399',
	liveSoft: 'rgba(52, 211, 153, 0.16)',
	danger: '#f87171',
	dangerSoft: 'rgba(248, 113, 113, 0.14)',
	edge: '#52525b',
	grid: '#2e2e33'
};

export interface ThemeOptions {
	/** `auto` follows the operating system setting. Default `auto`. */
	mode?: ThemeMode;
	/** Color overrides for both modes. */
	colors?: Partial<ThemeColors>;
	/** Color overrides for light mode only. */
	light?: Partial<ThemeColors>;
	/** Color overrides for dark mode only. */
	dark?: Partial<ThemeColors>;
	fontFamily?: string;
	monoFontFamily?: string;
	/** Base font size in px. Default 14. */
	fontSize?: number;
	/** Corner radius of cards and inputs in px. Default 10. */
	radius?: number;
	/** Width of a step card in px. Default 240. */
	nodeWidth?: number;
}

/**
 * The toolbar's parts, for a host with a header of its own: `ui.toolbar` takes `true` (all of them),
 * `false` (no toolbar at all) or this object, so losing the name field does not also lose undo.
 * Parts that have a `ui` option of their own are shown when both are on.
 */
export interface ToolbarOptions {
	/** The flow name field. Turn it off and render a `brand` snippet in its place. */
	name?: boolean;
	/** The problem badge — "Ready", "2 notes", "1 problem". */
	status?: boolean;
	/** Undo and redo. */
	undo?: boolean;
	/** The "Note" button. */
	note?: boolean;
	/** The "JSON" toggle — with `ui.json`. */
	json?: boolean;
	/** "Import" and "Export" — with `ui.importExport`. */
	importExport?: boolean;
	/** The flow list, Save and Activate — with `ui.flows` and a `backend`. */
	flows?: boolean;
	/** The "Executions" toggle — with `ui.executions` and a `backend`. */
	executions?: boolean;
	/** The "Run" button — with a `backend`. */
	run?: boolean;
	/** The "Test run" button — with `ui.testRun`. Hiding it does not disable `editor.run()`. */
	testRun?: boolean;
}

export type ResolvedToolbar = Required<ToolbarOptions>;

/** The parts that bring a labelled button with them, and so a full-height row. */
const WIDE_PARTS = ['name', 'json', 'importExport', 'flows', 'executions', 'run', 'testRun'] as const;

/**
 * A toolbar left with nothing but the badge and a couple of icons does not need a full row, so it
 * shrinks to a strip: no name field and none of the parts above. `status`, `undo` and `note` are
 * what may remain.
 */
export const isCompactToolbar = (toolbar: false | ResolvedToolbar): boolean =>
	toolbar !== false && WIDE_PARTS.every((part) => !toolbar[part]);

export interface UiOptions {
	/** Top bar with the flow name, status and actions: `true`, `false`, or the parts to keep. */
	toolbar?: boolean | ToolbarOptions;
	/** Step list on the left. */
	palette?: boolean;
	/** Settings / problems panel on the right. */
	inspector?: boolean;
	/** "Test run" button. It only hides the button; `editor.run()` still runs the flow. */
	testRun?: boolean;
	/** "JSON" panel for viewing and pasting flows. */
	json?: boolean;
	/** "Import" and "Export" buttons. */
	importExport?: boolean;
	/** Flow list, Save and Activate — with a `backend` only. */
	flows?: boolean;
	/** Run history panel — with a `backend` only. */
	executions?: boolean;
	/** Prompt bar for building and changing flows with AI — needs a `backend` that supports it. */
	ai?: boolean;
	/** Zoom buttons on the canvas. */
	controls?: boolean;
	minimap?: boolean;
	background?: 'dots' | 'lines' | 'cross' | 'none';
	/**
	 * Where Svelte Flow's attribution sits. It is that library's licence condition and cannot be
	 * turned off here — only moved out of the way. Default `bottom-right`.
	 */
	attribution?: 'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right';
	/**
	 * How a step is drawn. `card` is a full card with its category and summary,
	 * `tile` is a square of icon with the name underneath, `compact` is a single row.
	 * Default `card`.
	 */
	node?: 'card' | 'tile' | 'compact';
}

/** `toolbar` is resolved to its parts, or `false` when there is no toolbar. */
export type ResolvedUi = Omit<Required<UiOptions>, 'toolbar'> & { toolbar: false | ResolvedToolbar };

export const defaultToolbar: ResolvedToolbar = {
	name: true,
	status: true,
	undo: true,
	note: true,
	json: true,
	importExport: true,
	flows: true,
	executions: true,
	run: true,
	testRun: true
};

export const defaultUi: ResolvedUi = {
	toolbar: { ...defaultToolbar },
	palette: true,
	inspector: true,
	testRun: true,
	json: true,
	importExport: true,
	flows: true,
	executions: true,
	ai: true,
	controls: true,
	minimap: false,
	background: 'dots',
	attribution: 'bottom-right',
	node: 'card'
};

/** Every piece of interface text. `{name}` placeholders are filled in at render time. */
export const defaultLabels = {
	flowName: 'Flow name',
	untitled: 'Untitled flow',
	ready: 'Ready',
	problemCount: '{count} problem',
	problemsCount: '{count} problems',
	noteCount: '{count} note',
	notesCount: '{count} notes',
	json: 'JSON',
	import: 'Import',
	export: 'Export',
	testRun: 'Test run',
	stop: 'Stop',
	searchSteps: 'Search steps',
	noStepsMatch: 'No steps match “{query}”.',
	addStepHint: 'Click to add, or drag onto the canvas',
	trigger: 'Trigger',
	unknownStep: 'Unknown step type “{kind}”',
	needsAttention: 'Needs attention',
	looksGood: 'Looks good',
	flow: 'Flow',
	allGood: 'Every step is connected and configured. Press Test run to watch it go.',
	hintAdd: 'Click a step on the left, or drag it onto the canvas.',
	hintConnect: 'Drag from a dot on the right of a step to connect it.',
	hintJson: 'Open JSON to paste a flow written by code or an LLM.',
	/** Empty by default: give it text to add a hint about Import and Export. */
	hintImportExport: '',
	hintDelete: 'Select a step to edit it. Backspace deletes.',
	name: 'Name',
	optional: 'optional',
	duplicate: 'Duplicate',
	disable: 'Disable',
	enable: 'Enable',
	delete: 'Delete',
	add: 'Add',
	remove: 'Remove',
	useList: 'Use a list',
	emptyTitle: 'Start with a trigger',
	emptyBody: 'Pick a step from the list, or paste a flow into JSON.',
	runTitle: 'Test run',
	liveRunTitle: 'Run',
	running: 'Running…',
	completed: 'Completed',
	waiting: 'Waiting',
	failed: 'Failed',
	stopped: 'Stopped',
	simulated: 'Simulated — steps without a test mode still run',
	simulatedOnServer: 'Simulated on the server — steps without a test mode still run',
	simulatedNothing: 'Simulated — nothing was sent',
	simulatedOneRan: 'Simulated — 1 step had no test mode and really ran',
	simulatedRan: 'Simulated — {count} steps had no test mode and really ran',
	ranOnServer: 'Ran on the server',
	testRunNeedsServer: 'A test run needs the server these steps come from.',
	starting: 'Starting…',
	done: 'Done',
	close: 'Close',
	fixBeforeRun: 'Fix the problems before running.',
	imported: 'Imported “{name}”.',
	importedWithProblems: 'Imported with {count} problems to fix.',
	couldNotRead: 'Could not read that file.',
	jsonHint: 'Paste a flow from a file, your code, or an LLM and apply it. Positions are optional.',
	apply: 'Apply',
	revert: 'Revert',
	notJson: 'Not valid JSON: {error}',
	forTools: 'For code & AI tools',
	copyJson: 'Copy flow JSON',
	copyCatalog: 'Copy step catalog (for prompts)',
	copySchema: 'Copy JSON Schema',
	clipboardUnavailable: 'The clipboard is not available here.',
	settings: 'Settings',
	inputTab: 'Input',
	outputTab: 'Output',
	noRunData: 'Run a test to see the data this step receives and produces.',
	runNow: 'Run a test',
	iteration: 'Iteration',
	logs: 'Logs',
	dataFromSteps: 'Data from earlier steps',
	dragToMap: 'Drag a value onto a field, or type {{ in a field to pick one.',
	noUpstream: 'Connect earlier steps to use their data here.',
	notRunYet: 'Not run yet',
	preview: 'Preview',
	previewNeedsRun: 'Run a test to preview this value.',
	waitingFor: 'Waiting: {reason}',
	undo: 'Undo',
	redo: 'Redo',
	addNote: 'Note',
	notePlaceholder: 'Write a note…',
	selectedCount: '{count} selected',
	insertStep: 'Insert a step',
	pickToInsert: 'Insert a step here',
	pickToConnect: 'Add a connected step',
	flows: 'Flows',
	newFlow: 'New flow',
	noFlows: 'No flows on the server yet.',
	save: 'Save',
	saving: 'Saving…',
	saved: 'Saved “{name}”.',
	savedDraft: 'Saved as a draft — fix {problems} before it can run.',
	savedState: 'Saved',
	unsaved: 'Unsaved',
	saveFirst: 'Save the flow first.',
	openSubflow: 'Open this flow',
	subflowEmpty: 'This step has no flow id yet.',
	subflowNeedsServer: 'Opening a sub-flow needs a flow server.',
	subflowSaveFirst: 'Save your changes before opening a sub-flow.',
	subflowMissing: 'No flow called “{id}” is saved here.',
	backTo: 'Back to {name}',
	active: 'Active',
	paused: 'Paused',
	activate: 'Activate',
	deactivate: 'Pause',
	activeHint: 'Active flows answer webhooks and schedules.',
	versionLabel: 'v{version}',
	deleteFlowConfirm: 'Delete “{name}” and its runs from the server?',
	executions: 'Executions',
	noExecutions: 'No runs yet. Press Run to start one.',
	runLive: 'Run',
	liveRun: 'Live run — steps really happen',
	openExecution: 'Open',
	backToEditing: 'Back to editing',
	viewingRun: 'Viewing run {id}',
	cancelRun: 'Cancel run',
	resumeStep: 'Resume',
	credentials: 'Credentials',
	noCredential: 'None',
	newCredential: 'New credential…',
	credentialValue: 'Value',
	credentialsOff: 'Credentials are disabled on this server.',
	create: 'Create',
	cancel: 'Cancel',
	serverError: '{error}',
	askAi: 'Ask AI',
	aiPlaceholder: 'Describe what this flow should do…',
	aiEditPlaceholder: 'What should change?',
	aiWorking: 'Building…',
	aiKeep: 'Keep',
	aiDiscard: 'Discard',
	aiChangeCount: '{count} changes',
	aiNoChanges: 'Nothing changed.',
	aiBuilt: 'Built {count} steps',
	aiFixed: 'fixed after {count} tries',
	aiLeftovers: 'Kept, but {count} problems remain.',
	aiFailed: 'The model could not build a valid flow. Try describing it differently.',
	aiOff: 'Flow generation is off on this server.',
	aiStop: 'Stop',
	aiFix: 'Fix problems',
	aiExplain: 'Explain',
	aiExplaining: 'Reading the flow…',
	aiUnavailable: 'This server has no model configured.',
	addStep: 'Add step',
	steps: 'Steps',
	more: 'More',
	moreActions: 'More actions'
};

export type Labels = { [K in keyof typeof defaultLabels]: string };

export interface EditorOptions {
	/** Step types: a registry from `createRegistry`, or packs / step definitions to build one. */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	steps: Registry<any> | readonly (Pack | AnyNodeDefinition)[];
	/** Flow to show (object or JSON string). Changing it reloads the canvas. */
	flow?: Flow | string;
	/** `'light' | 'dark' | 'auto'`, or a full theme object. */
	theme?: ThemeMode | ThemeOptions;
	/** Show or hide parts of the interface. */
	ui?: UiOptions;
	/**
	 * Connects the editor to a flow server: open and save flows, activate them, pick credentials,
	 * run for real and watch past runs. `createHttpBackend(url)` talks to `@arcflow/server`.
	 */
	backend?: Backend;
	/** Replace any interface text, e.g. to translate the editor. */
	labels?: Partial<Labels>;
	/** View only: no adding, moving, connecting or editing. */
	readonly?: boolean;
	/** Persist edits in localStorage under this key and restore them on load. */
	storageKey?: string;
	/** Services handed to steps during Test run (which always runs in `simulate` mode). */
	services?: Services;
	/**
	 * Run variables for the editor's runs, readable as `{{ vars.name }}`. They are merged in when a
	 * run starts — over the flow's own `vars`, which are over the registry's `sampleVars` — and are
	 * never written into the flow, so live numbers stay out of what you save.
	 */
	vars?: Record<string, unknown>;
	/**
	 * Replace what a step says it will do, by kind. The definition's own `summary` is the fallback,
	 * so only the kinds you name change. The step itself comes along, for wording that depends on
	 * which one it is rather than only on its settings.
	 *
	 *   summaries: {
	 *     'trigger.schedule': (config) => `Every weekday at ${config.hour}`,
	 *     'action.transfer': (config, def, node) => `${node.label ?? def.title} → ${config.to}`
	 *   }
	 */
	summaries?: Record<string, (config: Record<string, unknown>, def: AnyNodeDefinition, node: FlowNode) => string>;
	/** Pause between steps during Test run, in ms. Default 450. */
	runStepDelay?: number;
	/** Called with the flow JSON after every change (debounced). */
	onChange?: (flow: Flow) => void;
	/** Called with the current problems whenever they change, including once on load. */
	onValidate?: (issues: Issue[]) => void;
	/** Called when the selected step changes. */
	onSelect?: (nodeId: string | null) => void;
	/** Called for every Test run event. */
	onRun?: (event: RunEvent) => void;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function resolveRegistry(steps: EditorOptions['steps']): Registry<any> {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	if (typeof (steps as Registry<any>).parse === 'function') return steps as Registry<any>;
	return createRegistry(steps as readonly (Pack | AnyNodeDefinition)[]);
}

const defined = <T extends object>(value: T | undefined): Partial<T> =>
	Object.fromEntries(Object.entries(value ?? {}).filter(([, v]) => v !== undefined && v !== null)) as Partial<T>;

/** `true` / `undefined` keep every part, `false` removes the toolbar, an object picks the parts. */
export const resolveToolbar = (toolbar: UiOptions['toolbar']): false | ResolvedToolbar =>
	toolbar === false ? false : typeof toolbar === 'object' ? { ...defaultToolbar, ...defined(toolbar) } : { ...defaultToolbar };

export const resolveUi = (ui?: UiOptions): ResolvedUi => ({ ...defaultUi, ...defined(ui), toolbar: resolveToolbar(ui?.toolbar) });

export const resolveLabels = (labels?: Partial<Labels>): Labels => ({ ...defaultLabels, ...defined(labels) });

/** Fills `{placeholders}` in a label. */
export const format = (template: string, values: Record<string, string | number>) =>
	template.replace(/\{(\w+)\}/g, (match, key: string) => (key in values ? String(values[key]) : match));

const COLOR_VARS: Record<keyof ThemeColors, string> = {
	background: '--fb-bg',
	surface: '--fb-surface',
	surfaceHover: '--fb-surface-2',
	surfaceActive: '--fb-surface-3',
	border: '--fb-line',
	borderStrong: '--fb-line-strong',
	text: '--fb-text',
	textSoft: '--fb-text-soft',
	textMuted: '--fb-text-muted',
	accent: '--fb-accent',
	accentSoft: '--fb-accent-soft',
	primary: '--fb-primary',
	primaryText: '--fb-primary-text',
	live: '--fb-live',
	liveSoft: '--fb-live-soft',
	danger: '--fb-danger',
	dangerSoft: '--fb-danger-soft',
	edge: '--fb-edge',
	grid: '--fb-grid'
};

// Values end up in a style attribute; keep them from breaking out of their declaration.
const cssValue = (value: string | number) => String(value).replace(/[;{}<>]/g, '');

export interface ResolvedTheme {
	mode: 'light' | 'dark';
	/** CSS custom properties for the editor root. */
	style: string;
	nodeWidth: number;
}

export function resolveTheme(theme: EditorOptions['theme'], prefersDark: boolean): ResolvedTheme {
	const options: ThemeOptions = typeof theme === 'string' ? { mode: theme } : (theme ?? {});
	const mode = options.mode === 'dark' || (options.mode !== 'light' && prefersDark) ? 'dark' : 'light';
	const colors: ThemeColors = {
		...(mode === 'dark' ? darkColors : lightColors),
		...defined(options.colors),
		...defined(mode === 'dark' ? options.dark : options.light)
	};

	const vars = Object.entries(colors).map(([key, value]) => `${COLOR_VARS[key as keyof ThemeColors]}: ${cssValue(value)}`);
	if (options.fontFamily) vars.push(`--fb-font: ${cssValue(options.fontFamily)}`);
	if (options.monoFontFamily) vars.push(`--fb-mono: ${cssValue(options.monoFontFamily)}`);
	if (options.fontSize) vars.push(`--fb-font-size: ${Number(options.fontSize)}px`);
	if (options.radius !== undefined) {
		vars.push(`--fb-radius: ${Number(options.radius)}px`, `--fb-radius-sm: ${Math.round(Number(options.radius) * 0.7)}px`);
	}
	const nodeWidth = Number(options.nodeWidth) > 0 ? Number(options.nodeWidth) : 240;
	vars.push(`--fb-node-width: ${nodeWidth}px`);

	return { mode, style: vars.join('; '), nodeWidth };
}
