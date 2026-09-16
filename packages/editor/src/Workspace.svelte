<script lang="ts">
	import { tick, untrack, type Snippet } from 'svelte';
	import {
		Background,
		BackgroundVariant,
		Controls,
		MiniMap,
		SvelteFlow,
		useSvelteFlow,
		type IsValidConnection,
		type OnConnectEnd
	} from '@xyflow/svelte';
	import {
		createEngine,
		defaultsOf,
		hasErrors,
		type AnyNodeDefinition,
		type Flow,
		type Issue,
		type RunEvent,
		type RunState,
		type RunStatus,
		type Services
	} from '@arcflow/core';
	import Icon from './Icon.svelte';
	import InsertEdge from './InsertEdge.svelte';
	import JsonPanel from './JsonPanel.svelte';
	import NoteNode from './NoteNode.svelte';
	import StepInspector from './StepInspector.svelte';
	import StepNode from './StepNode.svelte';
	import StepPalette from './StepPalette.svelte';
	import StepPicker from './StepPicker.svelte';
	import ExecutionsPanel from './ExecutionsPanel.svelte';
	import PromptBar from './PromptBar.svelte';
	import ServerBar from './ServerBar.svelte';
	import { BackendError, type ServerFlowSummary, type ServerRunSummary } from './backend.js';
	import { DRAG_TYPE, getEditor, type StepRunStatus } from './context.svelte.js';
	import {
		NOTE_SIZE,
		canvasEdge,
		fromCanvas,
		isStep,
		toCanvas,
		type CanvasEdge,
		type CanvasItem,
		type CanvasNode,
		type StepData
	} from './convert.js';
	import { format } from './options.js';

	interface Props {
		flow?: unknown;
		storageKey?: string;
		services?: Services;
		runStepDelay: number;
		themeStyle: string;
		themeMode: 'light' | 'dark';
		nodeWidth: number;
		brand?: Snippet;
		onChange?: (flow: Flow) => void;
		onValidate?: (issues: Issue[]) => void;
		onSelect?: (nodeId: string | null) => void;
		onRun?: (event: RunEvent) => void;
	}

	let {
		flow: incoming,
		storageKey,
		services,
		runStepDelay,
		themeStyle,
		themeMode,
		nodeWidth,
		brand,
		onChange,
		onValidate,
		onSelect,
		onRun
	}: Props = $props();

	type Point = { x: number; y: number };

	const nodeTypes = { step: StepNode, note: NoteNode };
	const edgeTypes = { flow: InsertEdge };
	const BACKGROUND = { dots: BackgroundVariant.Dots, lines: BackgroundVariant.Lines, cross: BackgroundVariant.Cross } as const;
	const HISTORY_LIMIT = 100;
	/** Shared so the fit on mount, the fit on init and the fit after a load all agree. */
	const FIT = { padding: 0.1, minZoom: 0.15, maxZoom: 1 } as const;
	const GAP = 60;

	const editor = getEditor();
	const registry = editor.registry;
	const labels = $derived(editor.labels);
	const ui = $derived(editor.ui);
	const readonly = $derived(editor.readonly);
	const { screenToFlowPosition, fitView, updateNodeData, deleteElements, setCenter } = useSvelteFlow();

	let meta = $state<Pick<Flow, 'name' | 'description' | 'vars'>>({ name: '' });
	let nodes = $state.raw<CanvasItem[]>([]);
	let edges = $state.raw<CanvasEdge[]>([]);
	let selectedId = $state<string | null>(null);
	let selectedCount = $state(0);
	let panel = $state<'step' | 'json'>('step');
	let rootEl = $state<HTMLDivElement>();
	let canvasEl = $state<HTMLDivElement>();
	let fileInput = $state<HTMLInputElement>();
	let notice = $state<string | null>(null);

	const backend = $derived(editor.backend);
	let serverFlows = $state.raw<ServerFlowSummary[]>([]);
	let serverFlow = $state.raw<ServerFlowSummary | null>(null);
	let serverRuns = $state.raw<ServerRunSummary[]>([]);
	let serverBusy = $state(false);
	let runsOpen = $state(false);
	let viewingRunId = $state<string | null>(null);
	/** The flow as it is on the server, to tell edited from saved. */
	let savedJson = $state('');
	let stopWatching: (() => void) | null = null;

	let aiBusy = $state(false);
	let aiOff = $state(false);
	let aiSuggestion = $state.raw<{
		before: Flow;
		changes: { type: string }[];
		issues: Issue[];
		attempts?: number;
		model?: string;
		/** Steps in a flow the model built from scratch. Absent when it changed an existing one. */
		built?: number;
	} | null>(null);
	/** Bumped to ignore a reply the user stopped waiting for. */
	let aiToken = 0;
	let aiExplaining = $state(false);
	let aiExplanation = $state<string | null>(null);

	type PickerState = {
		x: number;
		y: number;
		at: Point;
		edgeId?: string;
		from?: { nodeId: string; handleId: string | null; type: 'source' | 'target' };
	};
	let picker = $state<PickerState | null>(null);

	type LogEntry = { nodeId: string; status: 'success' | 'waiting' | 'error'; message?: string; at: number };
	let running = $state(false);
	let outcome = $state<RunStatus | null>(null);
	let log = $state<LogEntry[]>([]);
	let logOpen = $state(false);
	let logListEl = $state<HTMLElement | null>(null);
	let logPinned = $state(true);
	let controller: AbortController | null = null;

	const current = $derived(fromCanvas(meta, nodes, edges));
	const issues = $derived(registry.validate(current));
	const errorCount = $derived(issues.filter((issue) => issue.level === 'error').length);
	const steps = $derived(nodes.filter(isStep));
	const selected = $derived(steps.find((node) => node.id === selectedId) ?? null);

	/** Steps that run before the selected one, nearest first. */
	const upstream = $derived.by(() => {
		if (!selectedId) return [];
		const found: { id: string; title: string }[] = [];
		const seen = new Set([selectedId]);
		let frontier = [selectedId];
		while (frontier.length) {
			const next: string[] = [];
			for (const id of frontier) {
				for (const edge of edges) {
					if (edge.target !== id || seen.has(edge.source)) continue;
					seen.add(edge.source);
					next.push(edge.source);
					found.push({ id: edge.source, title: stepName(edge.source) });
				}
			}
			frontier = next;
		}
		return found;
	});

	const showPanel = $derived(ui.inspector || panel === 'json');
	const columns = $derived(
		[ui.palette && !readonly ? '264px' : '', 'minmax(0, 1fr)', showPanel ? (panel === 'json' ? '420px' : '320px') : ''].filter(Boolean).join(' ')
	);

	function apply(input: unknown): { loaded: boolean; issues: Issue[] } {
		const parsed = registry.parse(input);
		if (!parsed.flow) return { loaded: false, issues: parsed.issues };
		const canvas = toCanvas(parsed.flow, registry);
		meta = { name: parsed.flow.name, description: parsed.flow.description, vars: parsed.flow.vars };
		nodes = canvas.nodes;
		edges = canvas.edges;
		selectedId = null;
		picker = null;
		editor.lastRun = null;
		return { loaded: true, issues: parsed.issues };
	}

	function readStored(): unknown {
		if (!storageKey) return undefined;
		try {
			const raw = localStorage.getItem(storageKey);
			return raw ? JSON.parse(raw) : undefined;
		} catch {
			return undefined;
		}
	}

	untrack(() => {
		const stored = readStored();
		if (stored === undefined || !apply(stored).loaded) {
			apply(incoming ?? { version: 1, name: labels.untitled, nodes: [], edges: [] });
		}
	});

	/** The current flow as plain JSON. */
	export function getFlow(): Flow {
		return JSON.parse(JSON.stringify(current));
	}

	/** Current problems. */
	export function getIssues(): Issue[] {
		return JSON.parse(JSON.stringify(issues));
	}

	/** Replaces the canvas with a flow (object or JSON string). Undo brings the previous flow back. */
	export async function load(input: unknown) {
		closeLog();
		const result = apply(input);
		if (result.loaded) {
			await tick();
			fitView({ ...FIT, duration: 300 });
		}
		return result;
	}

	$effect(() => {
		const grouped: Record<string, Issue[]> = {};
		for (const issue of issues) if (issue.nodeId) (grouped[issue.nodeId] ??= []).push(issue);
		editor.issuesByNode = grouped;
	});

	let lastIssues = '';
	$effect(() => {
		const json = JSON.stringify(issues);
		untrack(() => {
			if (json === lastIssues) return;
			lastIssues = json;
			onValidate?.(JSON.parse(json));
		});
	});

	let lastSelected: string | null = null;
	$effect(() => {
		const id = selectedId;
		untrack(() => {
			if (id === lastSelected) return;
			lastSelected = id;
			onSelect?.(id);
		});
	});

	// ---------- History ----------

	/** Snapshots of the flow JSON. `committed` is the state the next undo returns from. */
	let past: string[] = [];
	let future: string[] = [];
	let committed = '';
	let canUndo = $state(false);
	let canRedo = $state(false);
	let historyTimer: ReturnType<typeof setTimeout> | undefined;

	const syncHistory = () => {
		canUndo = past.length > 0;
		canRedo = future.length > 0;
	};

	/** Records pending changes as one undo step. Called after a pause, and before undo/redo. */
	function commit() {
		clearTimeout(historyTimer);
		const json = JSON.stringify(current);
		if (json === committed) return;
		past.push(committed);
		if (past.length > HISTORY_LIMIT) past.shift();
		future = [];
		committed = json;
		syncHistory();
	}

	function restore(json: string) {
		const flow = JSON.parse(json) as Flow;
		const picked = new Set(nodes.filter((node) => node.selected).map((node) => node.id));
		const canvas = toCanvas(flow, registry);
		committed = json;
		picker = null;
		meta = { name: flow.name, description: flow.description, vars: flow.vars };
		nodes = canvas.nodes.map((node) => (picked.has(node.id) ? { ...node, selected: true } : node));
		edges = canvas.edges;
		if (selectedId && !steps.some((node) => node.id === selectedId)) selectedId = null;
	}

	/** Reverts the last change. */
	export function undo() {
		if (readonly) return;
		commit();
		const previous = past.pop();
		if (previous === undefined) return;
		future.push(committed);
		restore(previous);
		syncHistory();
	}

	/** Re-applies the last undone change. */
	export function redo() {
		if (readonly) return;
		commit();
		const next = future.pop();
		if (next === undefined) return;
		past.push(committed);
		restore(next);
		syncHistory();
	}

	let lastJson = '';
	let saveTimer: ReturnType<typeof setTimeout> | undefined;
	$effect(() => {
		const json = JSON.stringify(current);
		untrack(() => {
			if (json === lastJson) return;
			const initial = lastJson === '';
			lastJson = json;
			if (initial) {
				committed = json;
				return;
			}
			clearTimeout(historyTimer);
			if (json !== committed) historyTimer = setTimeout(commit, 400);
			clearTimeout(saveTimer);
			saveTimer = setTimeout(() => {
				onChange?.(JSON.parse(json));
				if (!storageKey) return;
				try {
					localStorage.setItem(storageKey, json);
				} catch {
					// storage can be unavailable (private mode); the editor keeps working
				}
			}, 200);
		});
	});
	$effect(() => () => {
		clearTimeout(saveTimer);
		clearTimeout(historyTimer);
	});

	// Reload when the host passes a different flow, ignoring echoes of our own changes.
	let lastIncoming = untrack(() => incoming);
	$effect(() => {
		const next = incoming;
		untrack(() => {
			if (next === lastIncoming) return;
			lastIncoming = next;
			if (next === undefined) return;
			const parsed = registry.parse(next);
			if (parsed.flow) {
				const canvas = toCanvas(parsed.flow, registry);
				if (JSON.stringify(fromCanvas(parsed.flow, canvas.nodes, canvas.edges)) === lastJson) return;
			}
			load(next);
		});
	});

	function flash(message: string) {
		notice = message;
		setTimeout(() => {
			if (notice === message) notice = null;
		}, 3500);
	}

	// ---------- Server mode ----------

	const dirty = $derived(savedJson !== JSON.stringify(current));
	const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

	async function withServer<T>(work: () => Promise<T>): Promise<T | null> {
		serverBusy = true;
		try {
			return await work();
		} catch (error) {
			flash(format(labels.serverError, { error: errorText(error) }));
			return null;
		} finally {
			serverBusy = false;
		}
	}

	async function refreshFlows() {
		if (!backend) return;
		const list = await withServer(() => backend.listFlows());
		if (list) serverFlows = list;
	}

	async function refreshRuns() {
		const flow = serverFlow;
		if (!backend || !flow) return;
		const list = await withServer(() => backend.listRuns({ flowId: flow.id, limit: 25 }));
		if (list) serverRuns = list;
	}

	async function refreshCredentials() {
		if (!backend) return;
		try {
			editor.credentials = await backend.listCredentials();
		} catch {
			// credentials are optional; credential fields fall back to a plain id input
		}
	}

	$effect(() => {
		if (!backend) return;
		untrack(() => {
			refreshFlows();
			refreshCredentials();
		});
	});

	$effect(() => () => stopWatching?.());

	editor.onCreateCredential = async (type, name, value) => {
		if (!backend) return null;
		try {
			const created = await backend.createCredential({ name, type, value });
			editor.credentials = [...editor.credentials, created];
			return created.id;
		} catch (error) {
			if (error instanceof BackendError && error.status === 503) editor.credentialsOff = true;
			flash(format(labels.serverError, { error: errorText(error) }));
			return null;
		}
	};

	/** Records that the canvas now matches the server. */
	function markSaved(record: ServerFlowSummary) {
		serverFlow = record;
		savedJson = JSON.stringify(current);
		serverFlows = serverFlows.some((flow) => flow.id === record.id)
			? serverFlows.map((flow) => (flow.id === record.id ? record : flow))
			: [...serverFlows, record];
	}

	function stopViewingRun() {
		stopWatching?.();
		stopWatching = null;
		viewingRunId = null;
		running = false;
		editor.lastRun = null;
		closeLog();
	}

	async function openServerFlow(id: string) {
		if (!backend) return;
		const result = await withServer(() => backend.getFlow(id));
		if (!result) return;
		stopViewingRun();
		await load(result.record.flow);
		const { flow: _flow, ...summary } = result.record;
		markSaved(summary);
		past = [];
		future = [];
		committed = savedJson;
		syncHistory();
		serverRuns = [];
		refreshRuns();
	}

	async function newServerFlow() {
		stopViewingRun();
		serverFlow = null;
		serverRuns = [];
		savedJson = '';
		await load({ version: 1, name: labels.untitled, nodes: [], edges: [] });
	}

	async function saveToServer(active?: boolean) {
		if (!backend || readonly) return;
		const result = await withServer(() =>
			backend.saveFlow({ ...(serverFlow ? { id: serverFlow.id } : {}), flow: getFlow(), ...(active === undefined ? {} : { active }) })
		);
		if (!result) return;
		const { flow: _flow, ...summary } = result.record;
		markSaved(summary);
		flash(format(labels.saved, { name: summary.name }));
	}

	function toggleActive() {
		if (!serverFlow) flash(labels.saveFirst);
		else saveToServer(!serverFlow.active);
	}

	async function deleteServerFlow(id: string) {
		if (!backend) return;
		const record = serverFlows.find((flow) => flow.id === id);
		if (typeof confirm === 'function' && !confirm(format(labels.deleteFlowConfirm, { name: record?.name ?? id }))) return;
		const done = await withServer(async () => {
			await backend.deleteFlow(id);
			return true;
		});
		if (!done) return;
		serverFlows = serverFlows.filter((flow) => flow.id !== id);
		if (serverFlow?.id === id) newServerFlow();
	}

	const STEP_STATUS: Record<string, StepRunStatus> = {
		success: 'success',
		error: 'error',
		waiting: 'waiting',
		skipped: 'skipped',
		running: 'running'
	};

	/** Shows a stored run: step states on the canvas, entries in the log, data in the inspector. */
	function paintRun(state: RunState) {
		resetRunVisuals();
		outcome = state.status;
		// Steps inside loops and sub-flows have compound keys; the canvas shows the outer ones.
		const steps = Object.entries(state.steps)
			.filter(([key]) => !key.includes('>') && !key.includes('/'))
			.map(([, step]) => step);
		for (const step of steps) setStatus(step.nodeId, STEP_STATUS[step.status] ?? 'running', step.message ?? step.error);
		log = steps
			.filter((step) => step.status !== 'skipped' && step.status !== 'pending')
			.map((step) => ({
				nodeId: step.nodeId,
				status: step.status === 'error' ? ('error' as const) : step.status === 'waiting' ? ('waiting' as const) : ('success' as const),
				message: step.message ?? step.error,
				at: step.startedAt ?? state.updatedAt
			}))
			.sort((a, b) => a.at - b.at);
		logOpen = true;
		pinLog();
	}

	/** Opens a run from the history; an empty id goes back to editing. */
	async function showServerRun(id: string) {
		if (!backend) return;
		if (!id) return stopViewingRun();
		const run = await withServer(() => backend.getRun(id));
		if (!run) return;
		viewingRunId = id;
		editor.lastRun = run.state;
		paintRun(run.state);
	}

	async function cancelServerRun(id: string) {
		if (!backend) return;
		await withServer(async () => {
			await backend.cancelRun(id);
			return true;
		});
		refreshRuns();
	}

	/** Saves the flow and runs it on the server for real, streaming events onto the canvas. */
	export async function runOnServer() {
		if (!backend) return;
		if (running) {
			if (viewingRunId) await cancelServerRun(viewingRunId);
			return;
		}
		if (hasErrors(issues)) {
			flash(labels.fixBeforeRun);
			return;
		}
		if (!serverFlow || dirty) await saveToServer();
		const flow = serverFlow;
		if (!flow) return;
		stopViewingRun();
		log = [];
		outcome = null;
		logOpen = true;
		pinLog();
		running = true;
		const started = await withServer(() => backend.startRun(flow.id, { mode: 'live' }));
		if (!started) {
			running = false;
			return;
		}
		viewingRunId = started.id;
		serverRuns = [started, ...serverRuns.filter((run) => run.id !== started.id)];
		stopWatching?.();
		stopWatching = backend.watchRun(
			started.id,
			(event) => {
				handleEvent(event);
				onRun?.(event);
			},
			(error) => {
				running = false;
				stopWatching = null;
				if (error) flash(format(labels.serverError, { error: errorText(error) }));
				showServerRun(started.id);
				refreshRuns();
			}
		);
	}

	// ---------- Flow generation ----------

	const canAi = $derived(Boolean(backend?.generateFlow) && ui.ai && !readonly && !aiOff);

	/**
	 * Asks the model for a flow (or for a change to this one) and puts it on the canvas straight away,
	 * keeping the old one so it can be put back.
	 */
	export async function askAi(prompt: string) {
		if (!backend?.generateFlow || aiBusy) return;
		const before = getFlow();
		const token = ++aiToken;
		aiBusy = true;
		try {
			const editing = Boolean(steps.length && backend.editFlow);
			const suggestion = editing ? await backend.editFlow!({ flow: before, instruction: prompt }) : await backend.generateFlow({ prompt });
			if (token !== aiToken) return; // stopped while waiting
			if (!suggestion.flow) {
				flash(suggestion.issues[0]?.message ?? labels.aiFailed);
				return;
			}
			await load(suggestion.flow);
			aiSuggestion = {
				before,
				changes: (suggestion.changes ?? []) as { type: string }[],
				issues: suggestion.issues,
				...(suggestion.attempts === undefined ? {} : { attempts: suggestion.attempts }),
				...(suggestion.model ? { model: suggestion.model } : {}),
				...(editing ? {} : { built: suggestion.flow.nodes.length })
			};
		} catch (error) {
			if (token !== aiToken) return;
			if (error instanceof BackendError && error.status === 501) {
				aiOff = true;
				flash(labels.aiOff);
			} else flash(format(labels.serverError, { error: errorText(error) }));
		} finally {
			if (token === aiToken) aiBusy = false;
		}
	}

	function keepAi() {
		const suggestion = aiSuggestion;
		aiSuggestion = null;
		const errors = suggestion?.issues.filter((issue) => issue.level === 'error').length ?? 0;
		if (errors) flash(format(labels.aiLeftovers, { count: errors }));
	}

	async function discardAi() {
		const suggestion = aiSuggestion;
		aiSuggestion = null;
		if (suggestion) await load(suggestion.before);
	}

	function stopAi() {
		aiToken++;
		aiBusy = false;
	}

	/** Asks the model what this flow does, in plain language. */
	export async function explainAi() {
		if (!backend?.explainFlow || aiExplaining) return;
		aiExplaining = true;
		try {
			const explanation = await backend.explainFlow({ flow: getFlow() });
			aiExplanation = explanation.text;
		} catch (error) {
			flash(format(labels.serverError, { error: errorText(error) }));
		} finally {
			aiExplaining = false;
		}
	}

	/** Hands the current errors to the model, with their paths, and asks for the smallest fix. */
	function fixProblems() {
		const errors = issues.filter((issue) => issue.level === 'error');
		if (!errors.length) return;
		askAi(
			`Fix these problems, changing as little as possible:\n${errors.map((issue) => `- ${issue.path || '(flow)'}: ${issue.message} [${issue.code}]`).join('\n')}`
		);
	}

	// ---------- Adding steps ----------

	const uniqueId = (base: string, taken: Set<string>) => {
		const stem = base.replace(/-\d+$/, '') || 'step';
		let id = stem;
		for (let n = 2; taken.has(id); n++) id = `${stem}-${n}`;
		taken.add(id);
		return id;
	};

	const makeId = (kind: string) =>
		uniqueId((kind.split('.').pop() || 'step').replace(/[^A-Za-z0-9_-]+/g, '-'), new Set(nodes.map((node) => node.id)));

	const unselect = <T extends { selected?: boolean }>(item: T): T => (item.selected ? { ...item, selected: false } : item);

	function insertNode(node: CanvasNode) {
		nodes = [...nodes.map(unselect), { ...node, selected: true }];
		edges = edges.map(unselect);
		selectedId = node.id;
		panel = 'step';
	}

	/** Nudges a new item down (or up) until it no longer covers an existing one. */
	function findFreeSpot(start: Point, size = { width: nodeWidth, height: 110 }, step = 40) {
		const spot = { ...start };
		const overlaps = () =>
			nodes.some((n) => {
				const w = n.width ?? n.measured?.width ?? nodeWidth;
				const h = n.height ?? n.measured?.height ?? 110;
				return (
					spot.x < n.position.x + w + 16 &&
					spot.x + size.width + 16 > n.position.x &&
					spot.y < n.position.y + h + 16 &&
					spot.y + size.height + 16 > n.position.y
				);
			});
		for (let i = 0; i < 60 && overlaps(); i++) spot.y += step;
		return spot;
	}

	function viewportCenter(): Point {
		const rect = canvasEl?.getBoundingClientRect();
		return screenToFlowPosition({ x: (rect?.left ?? 0) + (rect?.width ?? 0) / 2, y: (rect?.top ?? 0) + (rect?.height ?? 0) / 2 });
	}

	function newStep(kind: string, position: Point): CanvasNode | null {
		const def: AnyNodeDefinition | undefined = registry.get(kind);
		if (!def) return null;
		return { id: makeId(kind), type: 'step', position, data: { kind, config: defaultsOf(def.config) } };
	}

	function addNode(kind: string, at?: Point) {
		if (readonly) return;
		const center = viewportCenter();
		const node = newStep(kind, at ?? findFreeSpot({ x: center.x - nodeWidth / 2, y: center.y - 50 }));
		if (node) insertNode(node);
	}

	function addNote() {
		if (readonly) return;
		const center = viewportCenter();
		// Notes go above the steps rather than under them.
		const spot = findFreeSpot({ x: center.x - NOTE_SIZE.width / 2, y: center.y - NOTE_SIZE.height / 2 }, NOTE_SIZE, -40);
		const note: CanvasItem = {
			id: makeId('note'),
			type: 'note',
			position: { x: Math.round(spot.x), y: Math.round(spot.y) },
			...NOTE_SIZE,
			data: { text: '', editing: true },
			selected: true
		};
		nodes = [note, ...nodes.map(unselect)];
		edges = edges.map(unselect);
		selectedId = null;
	}

	function onDragOver(event: DragEvent) {
		if (readonly || !event.dataTransfer?.types.includes(DRAG_TYPE)) return;
		event.preventDefault();
		event.dataTransfer.dropEffect = 'move';
	}

	function onDrop(event: DragEvent) {
		const kind = event.dataTransfer?.getData(DRAG_TYPE);
		if (!kind || readonly) return;
		event.preventDefault();
		const point = screenToFlowPosition({ x: event.clientX, y: event.clientY });
		addNode(kind, { x: point.x - nodeWidth / 2, y: point.y - 30 });
	}

	const isValidConnection: IsValidConnection = (c) =>
		c.source !== c.target &&
		!edges.some((e) => e.source === c.source && (e.sourceHandle ?? 'out') === (c.sourceHandle ?? 'out') && e.target === c.target);

	// ---------- Inserting into connections ----------

	function openPicker(state: Omit<PickerState, 'x' | 'y'>, client: Point) {
		if (readonly || !canvasEl) return;
		const rect = canvasEl.getBoundingClientRect();
		const clamp = (value: number, max: number) => Math.max(8, Math.min(value, max));
		picker = { ...state, x: clamp(client.x - rect.left + 8, rect.width - 288), y: clamp(client.y - rect.top + 8, rect.height - 368) };
	}

	editor.onInsert = (edgeId, clientX, clientY) => {
		openPicker({ edgeId, at: screenToFlowPosition({ x: clientX, y: clientY }) }, { x: clientX, y: clientY });
	};
	$effect(() => () => {
		editor.onInsert = null;
	});

	const onConnectEnd: OnConnectEnd = (event, connection) => {
		if (readonly || connection.isValid || connection.toNode || !connection.fromNode || !connection.fromHandle) return;
		const point = 'changedTouches' in event ? event.changedTouches[0] : event;
		if (!point) return;
		const client = { x: point.clientX, y: point.clientY };
		openPicker(
			{
				at: screenToFlowPosition(client),
				from: { nodeId: connection.fromNode.id, handleId: connection.fromHandle.id ?? null, type: connection.fromHandle.type }
			},
			client
		);
	};

	/** The port a new step continues from: `done` for loops, otherwise its first output. */
	function mainOutput(kind: string): string | undefined {
		const def: AnyNodeDefinition | undefined = registry.get(kind);
		if (!def) return undefined;
		const outputs = def.outputs.filter((output) => output.id !== 'error');
		return def.loop && outputs.some((output) => output.id === 'done') ? 'done' : outputs[0]?.id;
	}

	/** Steps reachable from `id`, including it. */
	function downstreamOf(id: string, skipEdge: string) {
		const found = new Set([id]);
		let frontier = [id];
		while (frontier.length) {
			const next: string[] = [];
			for (const edge of edges) {
				if (edge.id === skipEdge || !frontier.includes(edge.source) || found.has(edge.target)) continue;
				found.add(edge.target);
				next.push(edge.target);
			}
			frontier = next;
		}
		return found;
	}

	function pick(kind: string) {
		const state = picker;
		picker = null;
		if (!state || readonly) return;
		const out = mainOutput(kind);

		if (state.edgeId) {
			const edge = edges.find((e) => e.id === state.edgeId);
			const source = edge && nodes.find((n) => n.id === edge.source);
			const target = edge && nodes.find((n) => n.id === edge.target);
			if (!edge || !source || !target) return;
			const x = source.position.x + (source.measured?.width ?? nodeWidth) + GAP;
			const node = newStep(kind, { x, y: Math.round((source.position.y + target.position.y) / 2) });
			if (!node) return;
			// Make room by moving everything after the connection to the right.
			const shift = x + nodeWidth + GAP - target.position.x;
			if (shift > 0) {
				const moving = downstreamOf(target.id, edge.id);
				moving.delete(source.id);
				nodes = nodes.map((n) => (moving.has(n.id) ? { ...n, position: { x: n.position.x + shift, y: n.position.y } } : n));
			}
			insertNode(node);
			edges = [
				...edges.filter((e) => e.id !== edge.id),
				canvasEdge(edge.source, edge.sourceHandle ?? 'out', node.id),
				...(out ? [canvasEdge(node.id, out, edge.target)] : [])
			];
			return;
		}

		if (state.from) {
			const { from } = state;
			const position = from.type === 'source' ? { x: state.at.x, y: state.at.y - 30 } : { x: state.at.x - nodeWidth, y: state.at.y - 30 };
			const node = newStep(kind, position);
			if (!node) return;
			insertNode(node);
			if (from.type === 'source') edges = [...edges, canvasEdge(from.nodeId, from.handleId ?? 'out', node.id)];
			else if (out) edges = [...edges, canvasEdge(node.id, out, from.nodeId)];
		}
	}

	// ---------- Selection, clipboard and shortcuts ----------

	/** Whether keyboard shortcuts and clipboard events belong to this editor (last click was inside it). */
	let active = false;
	let pointer: Point | null = null;

	const isTyping = (target: EventTarget | null) =>
		target instanceof Element && Boolean(target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])'));

	function selectAll() {
		nodes = nodes.map((node) => (node.selected ? node : { ...node, selected: true }));
	}

	function clearSelection() {
		nodes = nodes.map(unselect);
		edges = edges.map(unselect);
		selectedId = null;
	}

	const pickedItems = () => nodes.filter((node) => node.selected);

	/** Selected steps and notes with the connections between them, as flow JSON. */
	function fragment(items: CanvasItem[]): Flow {
		const ids = new Set(items.map((item) => item.id));
		return fromCanvas(meta, items, edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target)));
	}

	const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

	/**
	 * Adds a flow (or part of one) next to the current steps with fresh ids, keeping the
	 * connections between them and pointing `steps.<id>` expressions at the renamed steps.
	 */
	function insertFragment(input: unknown, place: { offset: number } | { at: Point }): number {
		if (readonly || typeof input !== 'object' || input === null || !Array.isArray((input as { nodes?: unknown }).nodes)) return 0;
		const parsed = registry.parse({ name: meta.name, edges: [], ...input, version: 1 });
		const flow = parsed.flow;
		if (!flow || (flow.nodes.length === 0 && !flow.annotations?.length)) return 0;

		const taken = new Set(nodes.map((node) => node.id));
		const rename = new Map<string, string>();
		for (const item of [...flow.nodes, ...(flow.annotations ?? [])]) rename.set(item.id, uniqueId(item.id, taken));
		const renamed = [...rename].filter(([from, to]) => from !== to);
		const retarget = (config: Record<string, unknown>) => {
			if (!renamed.length) return config;
			let json = JSON.stringify(config);
			for (const [from, to] of renamed) json = json.replace(new RegExp(`\\bsteps\\.${escapeRegExp(from)}(?![A-Za-z0-9_-])`, 'g'), `steps.${to}`);
			return JSON.parse(json) as Record<string, unknown>;
		};

		const canvas = toCanvas(
			{
				...flow,
				nodes: flow.nodes.map((node) => ({ ...node, id: rename.get(node.id)!, config: retarget(node.config) })),
				edges: flow.edges
					.filter((edge) => rename.has(edge.from) && rename.has(edge.to))
					.map((edge) => ({ ...edge, from: rename.get(edge.from)!, to: rename.get(edge.to)! })),
				annotations: flow.annotations?.map((note) => ({ ...note, id: rename.get(note.id)! }))
			},
			registry
		);

		let dx: number;
		let dy: number;
		if ('offset' in place) {
			dx = dy = place.offset;
		} else {
			dx = place.at.x - Math.min(...canvas.nodes.map((node) => node.position.x));
			dy = place.at.y - Math.min(...canvas.nodes.map((node) => node.position.y));
		}
		const placed = canvas.nodes.map((node) => ({
			...node,
			position: { x: Math.round(node.position.x + dx), y: Math.round(node.position.y + dy) },
			selected: true
		}));
		const existing = nodes.map(unselect);
		nodes = [...placed.filter((node) => !isStep(node)), ...existing, ...placed.filter(isStep)];
		edges = [...edges.map(unselect), ...canvas.edges];
		return placed.length;
	}

	function duplicate() {
		const items = pickedItems();
		if (items.length) insertFragment(fragment(items), { offset: 40 });
	}

	function deleteSelection() {
		if (readonly) return;
		deleteElements({ nodes: pickedItems().map((node) => ({ id: node.id })), edges: edges.filter((edge) => edge.selected) });
	}

	function onWindowPointerDown(event: PointerEvent) {
		active = Boolean(rootEl?.contains(event.target as Node));
	}

	function onWindowKeydown(event: KeyboardEvent) {
		if (!active || isTyping(event.target)) return;
		if (event.key === 'Escape') {
			if (picker) picker = null;
			else clearSelection();
			return;
		}
		if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
		switch (event.key.toLowerCase()) {
			case 'z':
				event.preventDefault();
				if (event.shiftKey) redo();
				else undo();
				break;
			case 'y':
				event.preventDefault();
				redo();
				break;
			case 'd':
				event.preventDefault();
				duplicate();
				break;
			case 'a':
				event.preventDefault();
				selectAll();
				break;
		}
	}

	function onClipboard(event: ClipboardEvent) {
		if (!active || isTyping(event.target) || !event.clipboardData) return;
		if (event.type === 'paste') {
			const text = event.clipboardData.getData('text/plain');
			let data: unknown;
			try {
				data = JSON.parse(text);
			} catch {
				return;
			}
			const center = viewportCenter();
			const at = pointer ? screenToFlowPosition(pointer) : { x: center.x - nodeWidth / 2, y: center.y - 50 };
			if (insertFragment(data, { at })) event.preventDefault();
			return;
		}
		if (document.getSelection()?.toString()) return; // copying page text
		const items = pickedItems();
		if (!items.length) return;
		event.preventDefault();
		event.clipboardData.setData('text/plain', JSON.stringify(fragment(items), null, 2));
		if (event.type === 'cut') deleteSelection();
	}

	// ---------- Editing the selected step ----------

	function updateSelected(update: (data: StepData) => Partial<StepData>) {
		if (selectedId && !readonly) updateNodeData(selectedId, (node) => update(node.data as StepData));
	}

	const setConfig = (key: string, value: unknown) =>
		updateSelected((data) => {
			const config = { ...data.config };
			if (value === undefined) delete config[key];
			else config[key] = value;
			return { config };
		});

	function removeSelected() {
		if (!selectedId || readonly) return;
		deleteElements({ nodes: [{ id: selectedId }] });
		selectedId = null;
	}

	function focusNode(id: string) {
		const node = nodes.find((n) => n.id === id);
		if (!node) return;
		nodes = nodes.map((n) => (Boolean(n.selected) !== (n.id === id) ? { ...n, selected: n.id === id } : n));
		selectedId = id;
		panel = 'step';
		setCenter(node.position.x + nodeWidth / 2, node.position.y + 60, { zoom: 1, duration: 400 });
	}

	// ---------- Test runs ----------

	function resetRunVisuals() {
		editor.runStatus = {};
		edges = edges.map((e) => (e.animated || e.class ? { ...e, animated: false, class: undefined } : e));
	}

	function setStatus(nodeId: string, status: StepRunStatus, message?: string) {
		editor.runStatus = { ...editor.runStatus, [nodeId]: { status, message } };
	}

	function handleEvent(event: RunEvent) {
		// Steps inside sub-flows (keys like "call>approve") belong to another flow's canvas.
		if ('key' in event && event.key.includes('>')) return;
		switch (event.type) {
			case 'step:start':
				setStatus(event.nodeId, 'running');
				break;
			case 'step:success':
				setStatus(event.nodeId, 'success', event.message);
				log = [...log, { nodeId: event.nodeId, status: 'success', message: event.message, at: event.at }];
				edges = edges.map((e) =>
					e.source === event.nodeId && event.ports.includes(e.sourceHandle ?? 'out') ? { ...e, animated: true, class: 'fb-edge-active' } : e
				);
				break;
			case 'step:wait':
				setStatus(event.nodeId, 'waiting', event.message ?? event.reason);
				log = [...log, { nodeId: event.nodeId, status: 'waiting', message: event.message ?? event.reason, at: event.at }];
				break;
			case 'step:error':
				setStatus(event.nodeId, 'error', event.error);
				log = [...log, { nodeId: event.nodeId, status: 'error', message: event.error, at: event.at }];
				break;
			case 'step:skip':
				// A branch skipped in one loop iteration should not hide what other iterations did.
				if (!event.key.includes('/')) setStatus(event.nodeId, 'skipped');
				break;
			case 'run:end':
				outcome = event.status;
				break;
		}
	}

	/** Runs the flow in simulate mode on the canvas, or stops a run in progress. */
	export async function run() {
		if (running) {
			controller?.abort();
			return;
		}
		resetRunVisuals();
		if (hasErrors(issues)) {
			flash(labels.fixBeforeRun);
			panel = 'step';
			selectedId = null;
			return;
		}
		log = [];
		outcome = null;
		logOpen = true;
		pinLog();
		running = true;
		controller = new AbortController();
		try {
			editor.lastRun = await createEngine(registry, { services }).start(current, {
				mode: 'simulate',
				stepDelayMs: runStepDelay,
				signal: controller.signal,
				onEvent: (event) => {
					handleEvent(event);
					onRun?.(event);
				}
			});
		} catch (error) {
			outcome = 'failed';
			flash(error instanceof Error ? error.message.split('\n')[0] : String(error));
		} finally {
			running = false;
			controller = null;
		}
	}

	/** Keeps the newest entry in view while a run streams in, unless the reader scrolled up. */
	$effect(() => {
		const entries = log.length;
		if (!logListEl || !entries || !logPinned) return;
		logListEl.scrollTop = logListEl.scrollHeight;
	});

	function onLogScroll(event: UIEvent) {
		const el = event.currentTarget as HTMLElement;
		logPinned = el.scrollHeight - el.scrollTop - el.clientHeight < 8;
	}

	/** A fresh run scrolls with its events again, however far the reader had scrolled before. */
	function pinLog() {
		logPinned = true;
	}

	function closeLog() {
		controller?.abort();
		logOpen = false;
		log = [];
		outcome = null;
		resetRunVisuals();
	}

	const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

	function exportFlow() {
		const blob = new Blob([JSON.stringify(getFlow(), null, 2)], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const link = document.createElement('a');
		link.href = url;
		link.download = `${slug(meta.name) || 'flow'}.json`;
		link.click();
		setTimeout(() => URL.revokeObjectURL(url), 1000);
	}

	async function importFlow(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;
		const result = await load(await file.text());
		const errors = result.issues.filter((issue) => issue.level === 'error').length;
		if (!result.loaded) flash(result.issues[0]?.message ?? labels.couldNotRead);
		else flash(errors ? format(labels.importedWithProblems, { count: errors }) : format(labels.imported, { name: meta.name }));
	}

	function stepName(nodeId: string) {
		const node = steps.find((n) => n.id === nodeId);
		return node?.data.label || (node && registry.get(node.data.kind)?.title) || nodeId;
	}
</script>

<svelte:window onpointerdown={onWindowPointerDown} onkeydown={onWindowKeydown} oncopy={onClipboard} oncut={onClipboard} onpaste={onClipboard} />

<div class="fb-root" class:no-toolbar={!ui.toolbar} data-theme={themeMode} style={themeStyle} bind:this={rootEl}>
	{#if ui.toolbar}
		<header class="fb-topbar">
			{#if brand}
				<div class="fb-brand">{@render brand()}</div>
				<span class="fb-divider"></span>
			{/if}
			<input class="fb-name" bind:value={meta.name} aria-label={labels.flowName} placeholder={labels.untitled} spellcheck="false" disabled={readonly} />
			<span class="fb-status" class:has-errors={errorCount > 0}>
				{#if errorCount}
					<Icon name="alert" size={13} />{format(errorCount === 1 ? labels.problemCount : labels.problemsCount, { count: errorCount })}
				{:else}
					<Icon name="check" size={13} stroke={2} />{labels.ready}
				{/if}
			</span>

			<div class="fb-spacer"></div>

			{#if !readonly}
				<button class="fb-icon-btn" onclick={undo} disabled={!canUndo} aria-label={labels.undo} title="{labels.undo} (⌘Z)"><Icon name="undo" size={16} /></button>
				<button class="fb-icon-btn" onclick={redo} disabled={!canRedo} aria-label={labels.redo} title="{labels.redo} (⇧⌘Z)"><Icon name="redo" size={16} /></button>
				<button class="fb-btn" onclick={addNote}><Icon name="note" size={15} />{labels.addNote}</button>
			{/if}
			{#if backend && ui.flows}
				<ServerBar
					flows={serverFlows}
					current={serverFlow}
					{dirty}
					busy={serverBusy}
					onopen={openServerFlow}
					onnew={newServerFlow}
					onsave={() => saveToServer()}
					ontoggleActive={toggleActive}
					ondelete={deleteServerFlow}
				/>
			{/if}
			{#if ui.json}
				<button class="fb-btn" class:is-on={panel === 'json'} onclick={() => (panel = panel === 'json' ? 'step' : 'json')}>{labels.json}</button>
			{/if}
			{#if ui.importExport}
				{#if !readonly}
					<button class="fb-btn" onclick={() => fileInput?.click()}><Icon name="upload" size={15} />{labels.import}</button>
					<input bind:this={fileInput} type="file" accept="application/json,.json" hidden onchange={importFlow} />
				{/if}
				<button class="fb-btn" onclick={exportFlow}><Icon name="download" size={15} />{labels.export}</button>
			{/if}
			{#if backend && ui.executions}
				<button
					class="fb-btn"
					class:is-on={runsOpen}
					onclick={() => {
						runsOpen = !runsOpen;
						if (runsOpen) refreshRuns();
					}}
				>
					<Icon name="clock" size={15} />{labels.executions}
				</button>
			{/if}
			{#if backend && !readonly}
				<button class="fb-btn primary" onclick={runOnServer} disabled={serverBusy} title={labels.liveRun}>
					<Icon name={running ? 'stop' : 'play'} size={13} />{running ? labels.stop : labels.runLive}
				</button>
			{/if}
			{#if ui.testRun}
				<button class="fb-btn" class:primary={!backend} onclick={run}>
					{#if running}
						<Icon name="stop" size={13} />{labels.stop}
					{:else}
						<Icon name="play" size={13} />{labels.testRun}
					{/if}
				</button>
			{/if}
		</header>
	{/if}

	<div class="fb-body" style:grid-template-columns={columns}>
		{#if ui.palette && !readonly}
			<StepPalette onadd={(kind) => addNode(kind)} />
		{/if}

		<div class="fb-stage">
			<div
				class="fb-canvas"
				bind:this={canvasEl}
				ondragover={onDragOver}
				ondrop={onDrop}
				onpointermove={(event) => (pointer = { x: event.clientX, y: event.clientY })}
				onpointerleave={() => (pointer = null)}
				role="application"
				aria-label={meta.name}
			>
				<SvelteFlow
					bind:nodes
					bind:edges
					{nodeTypes}
					{edgeTypes}
					{isValidConnection}
					colorMode={themeMode}
					fitView
					fitViewOptions={FIT}
					minZoom={0.15}
					maxZoom={1.6}
					connectionRadius={34}
					nodesDraggable={!readonly}
					nodesConnectable={!readonly}
					deleteKey={readonly ? null : ['Backspace', 'Delete']}
					defaultEdgeOptions={{ type: 'flow' }}
					oninit={() => void fitView(FIT)}
					onconnectend={onConnectEnd}
					onselectionchange={({ nodes: picked }) => {
						selectedCount = picked.length;
						selectedId = picked.length === 1 && picked[0].type === 'step' ? picked[0].id : null;
						if (selectedId) panel = 'step';
					}}
				>
					{#if ui.background !== 'none'}
						<Background variant={BACKGROUND[ui.background]} gap={24} size={1.2} />
					{/if}
					{#if ui.controls}
						<Controls position="bottom-right" showLock={false} />
					{/if}
					{#if ui.minimap}
						<MiniMap position="bottom-left" />
					{/if}
				</SvelteFlow>

				{#if nodes.length === 0}
					<div class="fb-empty">
						<div><strong>{labels.emptyTitle}</strong>{labels.emptyBody}</div>
					</div>
				{/if}

				{#if selectedCount > 1 && !readonly}
					<div class="fb-selection-bar" role="toolbar" aria-label={format(labels.selectedCount, { count: selectedCount })}>
						<span>{format(labels.selectedCount, { count: selectedCount })}</span>
						<button class="fb-btn ghost" onclick={duplicate}><Icon name="copy" size={14} />{labels.duplicate}</button>
						<button class="fb-btn ghost danger" onclick={deleteSelection}><Icon name="trash" size={14} />{labels.delete}</button>
					</div>
				{/if}

				{#if picker}
					<StepPicker
						x={picker.x}
						y={picker.y}
						title={picker.edgeId ? labels.pickToInsert : labels.pickToConnect}
						triggers={picker.from?.type === 'target'}
						onpick={pick}
						onclose={() => (picker = null)}
					/>
				{/if}

				{#if canAi}
					<PromptBar
						mode={steps.length ? 'edit' : 'create'}
						busy={aiBusy}
						problems={errorCount}
						suggestion={aiSuggestion}
						onsubmit={askAi}
						onkeep={keepAi}
						ondiscard={discardAi}
						onstop={stopAi}
						onfix={fixProblems}
						canExplain={Boolean(backend?.explainFlow)}
						explaining={aiExplaining}
						explanation={aiExplanation}
						onexplain={explainAi}
						ondismiss={() => (aiExplanation = null)}
					/>
				{/if}

				{#if runsOpen && backend}
					<ExecutionsPanel
						runs={serverRuns}
						selectedId={viewingRunId}
						onopen={showServerRun}
						onclose={() => (runsOpen = false)}
						onrefresh={refreshRuns}
						oncancel={cancelServerRun}
					/>
				{/if}

				{#if notice}
					<div class="fb-toast" role="status">{notice}</div>
				{/if}
			</div>

			<!-- Docked under the canvas, not over it: a run never hides the steps it is running. -->
			{#if logOpen}
				<section class="fb-log" aria-label={labels.runTitle} aria-live="polite">
					<div class="fb-log-head">
						<span>{labels.runTitle}</span>
						{#if running}
							<span class="fb-badge">{labels.running}</span>
						{:else if outcome === 'completed'}
							<span class="fb-badge ok">{labels.completed}</span>
						{:else if outcome === 'waiting'}
							<span class="fb-badge ok">{labels.waiting}</span>
						{:else if outcome === 'failed'}
							<span class="fb-badge bad">{labels.failed}</span>
						{:else if outcome === 'cancelled'}
							<span class="fb-badge">{labels.stopped}</span>
						{/if}
						<span class="fb-log-note">{labels.simulated}</span>
						<button class="fb-icon-btn" onclick={closeLog} aria-label={labels.close}><Icon name="x" size={15} /></button>
					</div>
					<div class="fb-log-list" bind:this={logListEl} onscroll={onLogScroll}>
						{#each log as entry, i (i)}
							<button class="fb-log-row" class:bad={entry.status === 'error'} onclick={() => focusNode(entry.nodeId)}>
								<Icon name={entry.status === 'error' ? 'x' : entry.status === 'waiting' ? 'hourglass' : 'check'} size={14} stroke={2.2} />
								<span class="fb-log-node">{stepName(entry.nodeId)}</span>
								<span class="fb-log-msg">{entry.message ?? labels.done}</span>
								<time>{new Date(entry.at).toLocaleTimeString([], { hour12: false })}</time>
							</button>
						{:else}
							<div class="fb-log-empty">{labels.starting}</div>
						{/each}
					</div>
				</section>
			{/if}
		</div>

		{#if panel === 'json'}
			<JsonPanel flow={current} onapply={load} onclose={() => (panel = 'step')} />
		{:else if ui.inspector}
			<StepInspector
				node={selected}
				{issues}
				{upstream}
				onrun={run}
				onconfig={setConfig}
				onlabel={(label) => updateSelected(() => ({ label }))}
				ontoggle={() => updateSelected((data) => ({ disabled: !data.disabled }))}
				ondelete={removeSelected}
				onduplicate={duplicate}
				onfocus={focusNode}
			/>
		{/if}
	</div>
</div>
