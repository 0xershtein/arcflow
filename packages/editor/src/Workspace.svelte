<script lang="ts">
	import { tick, untrack, type Snippet } from 'svelte';
	import {
		Background,
		BackgroundVariant,
		Controls,
		MiniMap,
		SvelteFlow,
		useSvelteFlow,
		type IsValidConnection
	} from '@xyflow/svelte';
	import {
		createEngine,
		defaultsOf,
		hasErrors,
		type AnyNodeDefinition,
		type Flow,
		type Issue,
		type RunEvent,
		type RunStatus,
		type Services
	} from '@arcflow/core';
	import Icon from './Icon.svelte';
	import JsonPanel from './JsonPanel.svelte';
	import StepInspector from './StepInspector.svelte';
	import StepNode from './StepNode.svelte';
	import StepPalette from './StepPalette.svelte';
	import { DRAG_TYPE, getEditor, type StepRunStatus } from './context.svelte.js';
	import { fromCanvas, toCanvas, type CanvasEdge, type CanvasNode, type StepData } from './convert.js';
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

	const nodeTypes = { step: StepNode };
	const BACKGROUND = { dots: BackgroundVariant.Dots, lines: BackgroundVariant.Lines, cross: BackgroundVariant.Cross } as const;

	const editor = getEditor();
	const registry = editor.registry;
	const labels = $derived(editor.labels);
	const ui = $derived(editor.ui);
	const readonly = $derived(editor.readonly);
	const { screenToFlowPosition, fitView, updateNodeData, deleteElements, setCenter } = useSvelteFlow();

	let meta = $state<Pick<Flow, 'name' | 'description' | 'vars'>>({ name: '' });
	let nodes = $state.raw<CanvasNode[]>([]);
	let edges = $state.raw<CanvasEdge[]>([]);
	let selectedId = $state<string | null>(null);
	let panel = $state<'step' | 'json'>('step');
	let canvasEl = $state<HTMLDivElement>();
	let fileInput = $state<HTMLInputElement>();
	let notice = $state<string | null>(null);

	type LogEntry = { nodeId: string; status: 'success' | 'waiting' | 'error'; message?: string; at: number };
	let running = $state(false);
	let outcome = $state<RunStatus | null>(null);
	let log = $state<LogEntry[]>([]);
	let logOpen = $state(false);
	let controller: AbortController | null = null;

	const current = $derived(fromCanvas(meta, nodes, edges));
	const issues = $derived(registry.validate(current));
	const errorCount = $derived(issues.filter((issue) => issue.level === 'error').length);
	const selected = $derived(nodes.find((node) => node.id === selectedId) ?? null);

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

	/** Replaces the canvas with a flow (object or JSON string). */
	export async function load(input: unknown) {
		closeLog();
		const result = apply(input);
		if (result.loaded) {
			await tick();
			fitView({ padding: 0.1, duration: 300 });
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

	let lastJson = '';
	let saveTimer: ReturnType<typeof setTimeout> | undefined;
	$effect(() => {
		const json = JSON.stringify(current);
		untrack(() => {
			if (json === lastJson) return;
			const initial = lastJson === '';
			lastJson = json;
			if (initial) return;
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
	$effect(() => () => clearTimeout(saveTimer));

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

	const makeId = (kind: string) => {
		const base = (kind.split('.').pop() || 'step').replace(/[^A-Za-z0-9_-]+/g, '-');
		let id = base;
		for (let n = 2; nodes.some((node) => node.id === id); n++) id = `${base}-${n}`;
		return id;
	};

	function insertNode(node: CanvasNode) {
		nodes = [...nodes.map((n) => (n.selected ? { ...n, selected: false } : n)), { ...node, selected: true }];
		selectedId = node.id;
		panel = 'step';
	}

	/** Nudges a new step down until it no longer covers an existing one. */
	function findFreeSpot(start: { x: number; y: number }) {
		const spot = { ...start };
		const height = 110;
		const overlaps = () =>
			nodes.some((n) => {
				const w = n.measured?.width ?? nodeWidth;
				const h = n.measured?.height ?? height;
				return spot.x < n.position.x + w + 16 && spot.x + nodeWidth + 16 > n.position.x && spot.y < n.position.y + h + 16 && spot.y + height + 16 > n.position.y;
			});
		for (let i = 0; i < 40 && overlaps(); i++) spot.y += 40;
		return spot;
	}

	function addNode(kind: string, at?: { x: number; y: number }) {
		const def: AnyNodeDefinition | undefined = registry.get(kind);
		if (!def || readonly) return;
		let position = at;
		if (!position) {
			const rect = canvasEl?.getBoundingClientRect();
			const center = screenToFlowPosition({ x: (rect?.left ?? 0) + (rect?.width ?? 0) / 2, y: (rect?.top ?? 0) + (rect?.height ?? 0) / 2 });
			position = findFreeSpot({ x: center.x - nodeWidth / 2, y: center.y - 50 });
		}
		insertNode({ id: makeId(kind), type: 'step', position, data: { kind, config: defaultsOf(def.config) } });
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

	function duplicateSelected() {
		if (!selected || readonly) return;
		insertNode({
			id: makeId(selected.data.kind),
			type: 'step',
			position: { x: selected.position.x + 40, y: selected.position.y + 40 },
			data: structuredClone($state.snapshot(selected.data)) as StepData
		});
	}

	function focusNode(id: string) {
		const node = nodes.find((n) => n.id === id);
		if (!node) return;
		nodes = nodes.map((n) => (Boolean(n.selected) !== (n.id === id) ? { ...n, selected: n.id === id } : n));
		selectedId = id;
		panel = 'step';
		setCenter(node.position.x + nodeWidth / 2, node.position.y + 60, { zoom: 1, duration: 400 });
	}

	function resetRunVisuals() {
		editor.runStatus = {};
		edges = edges.map((e) => (e.animated || e.class ? { ...e, animated: false, class: undefined } : e));
	}

	function setStatus(nodeId: string, status: StepRunStatus, message?: string) {
		editor.runStatus = { ...editor.runStatus, [nodeId]: { status, message } };
	}

	function handleEvent(event: RunEvent) {
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
		running = true;
		controller = new AbortController();
		try {
			await createEngine(registry, { services }).start(current, {
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
		const node = nodes.find((n) => n.id === nodeId);
		return node?.data.label || (node && registry.get(node.data.kind)?.title) || nodeId;
	}
</script>

<div class="fb-root" class:no-toolbar={!ui.toolbar} data-theme={themeMode} style={themeStyle}>
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
			{#if ui.testRun}
				<button class="fb-btn primary" onclick={run}>
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

		<div class="fb-canvas" bind:this={canvasEl} ondragover={onDragOver} ondrop={onDrop} role="application" aria-label={meta.name}>
			<SvelteFlow
				bind:nodes
				bind:edges
				{nodeTypes}
				{isValidConnection}
				colorMode={themeMode}
				fitView
				fitViewOptions={{ padding: 0.1, minZoom: 0.15 }}
				minZoom={0.15}
				maxZoom={1.6}
				nodesDraggable={!readonly}
				nodesConnectable={!readonly}
				deleteKey={readonly ? null : ['Backspace', 'Delete']}
				defaultEdgeOptions={{ type: 'default' }}
				onselectionchange={({ nodes: picked }) => {
					selectedId = picked.length === 1 ? picked[0].id : null;
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
					<div class="fb-log-list">
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

			{#if notice}
				<div class="fb-toast" role="status">{notice}</div>
			{/if}
		</div>

		{#if panel === 'json'}
			<JsonPanel flow={current} onapply={load} onclose={() => (panel = 'step')} />
		{:else if ui.inspector}
			<StepInspector
				node={selected}
				{issues}
				onconfig={setConfig}
				onlabel={(label) => updateSelected(() => ({ label }))}
				ontoggle={() => updateSelected((data) => ({ disabled: !data.disabled }))}
				ondelete={removeSelected}
				onduplicate={duplicateSelected}
				onfocus={focusNode}
			/>
		{/if}
	</div>
</div>
