import {
	createRegistry,
	type AnyNodeDefinition,
	type Flow,
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

export interface UiOptions {
	/** Top bar with the flow name, status and actions. */
	toolbar?: boolean;
	/** Step list on the left. */
	palette?: boolean;
	/** Settings / problems panel on the right. */
	inspector?: boolean;
	/** "Test run" button. */
	testRun?: boolean;
	/** "JSON" panel for viewing and pasting flows. */
	json?: boolean;
	/** "Import" and "Export" buttons. */
	importExport?: boolean;
	/** Zoom buttons on the canvas. */
	controls?: boolean;
	minimap?: boolean;
	background?: 'dots' | 'lines' | 'cross' | 'none';
}

export type ResolvedUi = Required<UiOptions>;

export const defaultUi: ResolvedUi = {
	toolbar: true,
	palette: true,
	inspector: true,
	testRun: true,
	json: true,
	importExport: true,
	controls: true,
	minimap: false,
	background: 'dots'
};

/** Every piece of interface text. `{name}` placeholders are filled in at render time. */
export const defaultLabels = {
	flowName: 'Flow name',
	untitled: 'Untitled flow',
	ready: 'Ready',
	problemCount: '{count} problem',
	problemsCount: '{count} problems',
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
	running: 'Running…',
	completed: 'Completed',
	waiting: 'Waiting',
	failed: 'Failed',
	stopped: 'Stopped',
	simulated: 'Simulated — nothing is sent',
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
	waitingFor: 'Waiting: {reason}'
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
	/** Replace any interface text, e.g. to translate the editor. */
	labels?: Partial<Labels>;
	/** View only: no adding, moving, connecting or editing. */
	readonly?: boolean;
	/** Persist edits in localStorage under this key and restore them on load. */
	storageKey?: string;
	/** Services handed to steps during Test run (which always runs in `simulate` mode). */
	services?: Services;
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

export const resolveUi = (ui?: UiOptions): ResolvedUi => ({ ...defaultUi, ...defined(ui) });

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
