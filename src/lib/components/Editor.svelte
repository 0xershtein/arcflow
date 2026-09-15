<script lang="ts">
	import { tick, untrack, type Snippet } from 'svelte';
	import {
		Background,
		BackgroundVariant,
		Controls,
		SvelteFlow,
		useSvelteFlow,
		type IsValidConnection
	} from '@xyflow/svelte';
	import FlowNodeView from './FlowNode.svelte';
	import Icon from './Icon.svelte';
	import Inspector from './Inspector.svelte';
	import Palette from './Palette.svelte';
	import { DRAG_TYPE, getBuilder } from '../flow/state.svelte';
	import { runFlow, type RunEvent, type RunOutcome } from '../flow/runner';
	import { fromDocument, toDocument } from '../flow/serialize';
	import { validateFlow, type Issue } from '../flow/validate';
	import type { FlowDocument, FlowEdge, FlowNode, FlowNodeData } from '../flow/types';

	let { initial, storageKey, brand }: { initial: FlowDocument; storageKey?: string; brand?: Snippet } = $props();

	const NODE_WIDTH = 240;
	const nodeTypes = { flow: FlowNodeView };

	const builder = getBuilder();
	const registry = builder.registry;
	const { screenToFlowPosition, fitView, updateNodeData, deleteElements, setCenter } = useSvelteFlow();

	function readStored() {
		if (!storageKey) return null;
		try {
			const raw = localStorage.getItem(storageKey);
			return raw ? fromDocument(JSON.parse(raw), registry) : null;
		} catch {
			return null;
		}
	}

	const start = untrack(() => readStored() ?? fromDocument(initial, registry));

	let name = $state(start.name);
	let nodes = $state.raw<FlowNode[]>(start.nodes);
	let edges = $state.raw<FlowEdge[]>(start.edges);
	let selectedId = $state<string | null>(null);
	let canvasEl = $state<HTMLDivElement>();
	let fileInput = $state<HTMLInputElement>();
	let notice = $state<string | null>(null);

	let running = $state(false);
	let outcome = $state<RunOutcome | null>(null);
	let log = $state<RunEvent[]>([]);
	let logOpen = $state(false);
	let controller: AbortController | null = null;

	const selected = $derived(nodes.find((n) => n.id === selectedId) ?? null);
	const issues = $derived(validateFlow(nodes, edges, registry));
	const errorCount = $derived(issues.filter((i) => i.level === 'error').length);

	$effect(() => {
		const grouped: Record<string, Issue[]> = {};
		for (const issue of issues) if (issue.nodeId) (grouped[issue.nodeId] ??= []).push(issue);
		builder.issuesByNode = grouped;
	});

	$effect(() => {
		if (!storageKey) return;
		const doc = JSON.stringify(toDocument(name, nodes, edges));
		const timer = setTimeout(() => {
			try {
				localStorage.setItem(storageKey, doc);
			} catch {
				// storage can be unavailable (private mode); the editor keeps working without it
			}
		}, 300);
		return () => clearTimeout(timer);
	});

	function flash(message: string) {
		notice = message;
		setTimeout(() => {
			if (notice === message) notice = null;
		}, 3500);
	}

	let seq = 0;
	const makeId = (kind: string) => `${kind.split('.').pop()}-${Date.now().toString(36)}${(seq++).toString(36)}`;

	function insertNode(node: FlowNode) {
		nodes = [...nodes.map((n) => (n.selected ? { ...n, selected: false } : n)), { ...node, selected: true }];
		selectedId = node.id;
	}

	function addNode(kind: string, at?: { x: number; y: number }) {
		const def = registry.get(kind);
		if (!def) return;
		let position = at;
		if (!position) {
			const rect = canvasEl?.getBoundingClientRect();
			const center = screenToFlowPosition({
				x: (rect?.left ?? 0) + (rect?.width ?? 0) / 2,
				y: (rect?.top ?? 0) + (rect?.height ?? 0) / 2
			});
			position = findFreeSpot({ x: center.x - NODE_WIDTH / 2, y: center.y - 50 });
		}
		insertNode({ id: makeId(kind), type: 'flow', position, data: { kind, config: structuredClone(def.defaults ?? {}) } });
	}

	/** Nudges a new step down until it no longer covers an existing one. */
	function findFreeSpot(start: { x: number; y: number }) {
		const spot = { ...start };
		const height = 110;
		const overlaps = () =>
			nodes.some((n) => {
				const w = n.measured?.width ?? NODE_WIDTH;
				const h = n.measured?.height ?? height;
				return (
					spot.x < n.position.x + w + 16 &&
					spot.x + NODE_WIDTH + 16 > n.position.x &&
					spot.y < n.position.y + h + 16 &&
					spot.y + height + 16 > n.position.y
				);
			});
		for (let i = 0; i < 40 && overlaps(); i++) spot.y += 40;
		return spot;
	}

	function onDragOver(event: DragEvent) {
		if (!event.dataTransfer?.types.includes(DRAG_TYPE)) return;
		event.preventDefault();
		event.dataTransfer.dropEffect = 'move';
	}

	function onDrop(event: DragEvent) {
		const kind = event.dataTransfer?.getData(DRAG_TYPE);
		if (!kind) return;
		event.preventDefault();
		const point = screenToFlowPosition({ x: event.clientX, y: event.clientY });
		addNode(kind, { x: point.x - NODE_WIDTH / 2, y: point.y - 30 });
	}

	const isValidConnection: IsValidConnection = (c) =>
		c.source !== c.target &&
		!edges.some(
			(e) => e.source === c.source && (e.sourceHandle ?? 'out') === (c.sourceHandle ?? 'out') && e.target === c.target
		);

	function setConfig(key: string, value: unknown) {
		if (!selectedId) return;
		updateNodeData(selectedId, (node) => ({ config: { ...(node.data as FlowNodeData).config, [key]: value } }));
	}

	function setLabel(label: string) {
		if (selectedId) updateNodeData(selectedId, { label });
	}

	function removeSelected() {
		if (!selectedId) return;
		deleteElements({ nodes: [{ id: selectedId }] });
		selectedId = null;
	}

	function duplicateSelected() {
		if (!selected) return;
		insertNode({
			id: makeId(selected.data.kind),
			type: 'flow',
			position: { x: selected.position.x + 40, y: selected.position.y + 40 },
			data: structuredClone(selected.data)
		});
	}

	function focusNode(id: string) {
		const node = nodes.find((n) => n.id === id);
		if (!node) return;
		nodes = nodes.map((n) => (n.selected !== (n.id === id) ? { ...n, selected: n.id === id } : n));
		selectedId = id;
		setCenter(node.position.x + NODE_WIDTH / 2, node.position.y + 60, { zoom: 1, duration: 400 });
	}

	function resetRunVisuals() {
		builder.runStatus = {};
		edges = edges.map((e) => (e.animated || e.class ? { ...e, animated: false, class: undefined } : e));
	}

	async function toggleRun() {
		if (running) {
			controller?.abort();
			return;
		}
		resetRunVisuals();
		log = [];
		outcome = null;
		logOpen = true;
		running = true;
		controller = new AbortController();
		try {
			outcome = await runFlow(nodes, edges, registry, {
				vars: registry.sampleVars,
				signal: controller.signal,
				onEvent: (event) => {
					builder.runStatus = { ...builder.runStatus, [event.nodeId]: { status: event.status, message: event.message } };
					if (event.status === 'success' || event.status === 'error') log = [...log, event];
				},
				onEdge: (edgeId) => {
					edges = edges.map((e) => (e.id === edgeId ? { ...e, animated: true, class: 'fb-edge-active' } : e));
				}
			});
		} catch (err) {
			outcome = 'failed';
			flash(err instanceof Error ? err.message : 'The test run crashed.');
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

	async function loadDocument(doc: { name: string; nodes: FlowNode[]; edges: FlowEdge[] }) {
		closeLog();
		name = doc.name;
		nodes = doc.nodes;
		edges = doc.edges;
		selectedId = null;
		await tick();
		fitView({ padding: 0.1, duration: 300 });
	}

	const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

	function exportFlow() {
		const blob = new Blob([JSON.stringify(toDocument(name, nodes, edges), null, 2)], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const link = document.createElement('a');
		link.href = url;
		link.download = `${slug(name) || 'flow'}.json`;
		link.click();
		setTimeout(() => URL.revokeObjectURL(url), 1000);
	}

	async function importFlow(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;
		try {
			const doc = fromDocument(JSON.parse(await file.text()), registry);
			await loadDocument(doc);
			flash(`Imported “${doc.name}”.`);
		} catch (err) {
			flash(err instanceof SyntaxError ? 'That file is not valid JSON.' : err instanceof Error ? err.message : 'Could not read that file.');
		}
	}

	function stepName(nodeId: string) {
		const node = nodes.find((n) => n.id === nodeId);
		return node?.data.label || (node && registry.get(node.data.kind)?.title) || nodeId;
	}
</script>

<div class="fb-root">
	<header class="fb-topbar">
		{#if brand}
			<div class="fb-brand">{@render brand()}</div>
			<span class="fb-divider"></span>
		{/if}
		<input class="fb-name" bind:value={name} aria-label="Flow name" spellcheck="false" />
		<span class="fb-status" class:has-errors={errorCount > 0}>
			{#if errorCount}
				<Icon name="alert" size={13} />{errorCount} {errorCount === 1 ? 'problem' : 'problems'}
			{:else}
				<Icon name="check" size={13} stroke={2} />Ready
			{/if}
		</span>

		<div class="fb-spacer"></div>

		<button class="fb-btn ghost" onclick={() => loadDocument(fromDocument(initial, registry))}>Reset</button>
		<button class="fb-btn" onclick={() => fileInput?.click()}><Icon name="upload" size={15} />Import</button>
		<input bind:this={fileInput} type="file" accept="application/json,.json" hidden onchange={importFlow} />
		<button class="fb-btn" onclick={exportFlow}><Icon name="download" size={15} />Export</button>
		<button class="fb-btn primary" onclick={toggleRun}>
			{#if running}
				<Icon name="stop" size={13} />Stop
			{:else}
				<Icon name="play" size={13} />Test run
			{/if}
		</button>
	</header>

	<div class="fb-body">
		<Palette {registry} onadd={(kind) => addNode(kind)} />

		<div class="fb-canvas" bind:this={canvasEl} ondragover={onDragOver} ondrop={onDrop} role="application" aria-label="Flow canvas">
			<SvelteFlow
				bind:nodes
				bind:edges
				{nodeTypes}
				{isValidConnection}
				colorMode="dark"
				fitView
				fitViewOptions={{ padding: 0.1 }}
				minZoom={0.3}
				maxZoom={1.6}
				deleteKey={['Backspace', 'Delete']}
				defaultEdgeOptions={{ type: 'default' }}
				onselectionchange={({ nodes: picked }) => (selectedId = picked.length === 1 ? picked[0].id : null)}
			>
				<Background variant={BackgroundVariant.Dots} gap={24} size={1.2} />
				<Controls position="bottom-right" showLock={false} />
			</SvelteFlow>

			{#if nodes.length === 0}
				<div class="fb-empty">
					<div><strong>Start with a trigger</strong>Pick one from the left to begin your flow.</div>
				</div>
			{/if}

			{#if logOpen}
				<section class="fb-log" aria-label="Test run" aria-live="polite">
					<div class="fb-log-head">
						<span>Test run</span>
						{#if running}
							<span class="fb-badge">Running…</span>
						{:else if outcome === 'completed'}
							<span class="fb-badge ok">Completed</span>
						{:else if outcome === 'failed'}
							<span class="fb-badge bad">Failed</span>
						{:else if outcome === 'aborted'}
							<span class="fb-badge">Stopped</span>
						{/if}
						<span class="fb-log-note">Simulated — nothing is sent</span>
						<button class="fb-icon-btn" onclick={closeLog} aria-label="Close test run"><Icon name="x" size={15} /></button>
					</div>
					<div class="fb-log-list">
						{#each log as event, i (i)}
							<button class="fb-log-row" class:bad={event.status === 'error'} onclick={() => focusNode(event.nodeId)}>
								<Icon name={event.status === 'error' ? 'x' : 'check'} size={14} stroke={2.2} />
								<span class="fb-log-node">{stepName(event.nodeId)}</span>
								<span class="fb-log-msg">{event.message ?? 'Done'}</span>
								<time>{new Date(event.at).toLocaleTimeString([], { hour12: false })}</time>
							</button>
						{:else}
							<div class="fb-log-empty">Starting…</div>
						{/each}
					</div>
				</section>
			{/if}

			{#if notice}
				<div class="fb-toast" role="status">{notice}</div>
			{/if}
		</div>

		<Inspector
			node={selected}
			{registry}
			{issues}
			onconfig={setConfig}
			onlabel={setLabel}
			ondelete={removeSelected}
			onduplicate={duplicateSelected}
			onfocus={focusNode}
		/>
	</div>
</div>
