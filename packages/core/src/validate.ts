import { referencedSteps } from './expressions.js';
import type { Flow } from './flow.js';
import type { Issue } from './issues.js';
import type { AnyNodeDefinition } from './node.js';
import { parseShape } from './schema.js';

export interface StepLookup {
	get(kind: string): AnyNodeDefinition | undefined;
}

/**
 * Semantic checks on a structurally valid flow: known kinds, config values, ports, triggers,
 * loops, reachability, `requires.upstream` rules, and `{{ steps.x }}` references.
 */
export function validateFlow(flow: Flow, registry: StepLookup): Issue[] {
	const issues: Issue[] = [];
	const add = (level: Issue['level'], code: Issue['code'], path: string, message: string, extra: Partial<Issue> = {}) =>
		issues.push({ level, code, path, message, ...extra });

	const index = new Map(flow.nodes.map((node, i) => [node.id, i]));
	const defs = new Map(flow.nodes.map((node) => [node.id, registry.get(node.kind)]));
	const nameOf = (id: string) => {
		const node = flow.nodes[index.get(id)!];
		return node?.label || defs.get(id)?.title || id;
	};

	const incoming = new Map(flow.nodes.map((node) => [node.id, [] as string[]]));
	const outgoing = new Map(flow.nodes.map((node) => [node.id, [] as string[]]));

	flow.edges.forEach((edge, i) => {
		const path = `edges[${i}]`;
		const known = { from: index.has(edge.from), to: index.has(edge.to) };
		if (!known.from) add('error', 'unknown_node', `${path}.from`, `A connection starts at missing step "${edge.from}".`, { edgeId: edge.id });
		if (!known.to) add('error', 'unknown_node', `${path}.to`, `A connection points to missing step "${edge.to}".`, { edgeId: edge.id });
		if (!known.from || !known.to) return;

		const from = defs.get(edge.from);
		if (from && !from.outputs.some((port) => port.id === edge.port)) {
			const ports = from.outputs.map((port) => port.id).join(', ') || 'none';
			add('error', 'unknown_port', `${path}.port`, `${nameOf(edge.from)} has no output "${edge.port}" (outputs: ${ports}).`, {
				edgeId: edge.id,
				nodeId: edge.from
			});
		}
		if (defs.get(edge.to)?.trigger) {
			add('error', 'trigger_input', `${path}.to`, `${nameOf(edge.to)} is a trigger and cannot have incoming connections.`, {
				edgeId: edge.id,
				nodeId: edge.to
			});
		}
		incoming.get(edge.to)!.push(edge.from);
		outgoing.get(edge.from)!.push(edge.to);
	});

	const upstreamOf = (id: string) => {
		const seen = new Set<string>();
		const stack = [...incoming.get(id)!];
		while (stack.length) {
			const next = stack.pop()!;
			if (seen.has(next)) continue;
			seen.add(next);
			stack.push(...incoming.get(next)!);
		}
		return seen;
	};

	const triggers = flow.nodes.filter((node) => defs.get(node.id)?.trigger).map((node) => node.id);
	if (triggers.length === 0) add('error', 'no_trigger', 'nodes', 'Add a trigger step so the flow knows when to start.');

	flow.nodes.forEach((node, i) => {
		const path = `nodes[${i}]`;
		const def = defs.get(node.id);
		const name = nameOf(node.id);
		if (!def) {
			add('error', 'unknown_kind', `${path}.kind`, `Unknown step type "${node.kind}".`, { nodeId: node.id });
			return;
		}

		const parsed = parseShape(def.config, node.config, `${path}.config`, { allowExpressions: true });
		for (const issue of parsed.issues) issues.push({ ...issue, message: `${name}: ${issue.message}`, nodeId: node.id });
		if (def.check && !parsed.issues.some((issue) => issue.level === 'error')) {
			try {
				const message = def.check(parsed.value);
				if (message) add('error', 'check_failed', `${path}.config`, `${name}: ${message}`, { nodeId: node.id });
			} catch {
				// checks may not understand unresolved expressions; the engine validates again at run time
			}
		}

		if (!def.trigger && incoming.get(node.id)!.length === 0) {
			add('warning', 'disconnected', path, `${name} is not connected to anything before it.`, { nodeId: node.id });
		}

		const upstream = def.requires || referencedSteps(node.config).length ? upstreamOf(node.id) : new Set<string>();
		if (def.requires) {
			const kinds = new Set([...upstream].map((id) => flow.nodes[index.get(id)!].kind));
			if (!def.requires.upstream.some((kind) => kinds.has(kind))) {
				add('error', 'missing_upstream', path, `${name}: ${def.requires.message}`, { nodeId: node.id });
			}
		}
		for (const ref of referencedSteps(node.config)) {
			if (!index.has(ref)) {
				add('warning', 'unknown_reference', `${path}.config`, `${name} refers to missing step "${ref}".`, { nodeId: node.id });
			} else if (!upstream.has(ref)) {
				add('warning', 'unknown_reference', `${path}.config`, `${name} refers to "${nameOf(ref)}", which does not run before it.`, {
					nodeId: node.id
				});
			}
		}
	});

	// Loops
	const state = new Map<string, 'open' | 'done'>();
	const findCycle = (id: string): string | null => {
		if (state.get(id) === 'open') return id;
		if (state.get(id) === 'done') return null;
		state.set(id, 'open');
		for (const next of outgoing.get(id)!) {
			const hit = findCycle(next);
			if (hit) return hit;
		}
		state.set(id, 'done');
		return null;
	};
	for (const node of flow.nodes) {
		const hit = findCycle(node.id);
		if (hit) {
			add('error', 'cycle', `nodes[${index.get(hit)}]`, `The flow loops back to ${nameOf(hit)}. Flows must not contain loops.`, { nodeId: hit });
			break;
		}
	}

	// Reachability from triggers
	const reached = new Set<string>();
	const stack = [...triggers];
	while (stack.length) {
		const id = stack.pop()!;
		if (reached.has(id)) continue;
		reached.add(id);
		stack.push(...outgoing.get(id)!);
	}
	if (triggers.length) {
		flow.nodes.forEach((node, i) => {
			if (reached.has(node.id) || !defs.get(node.id) || incoming.get(node.id)!.length === 0) return;
			add('warning', 'unreachable', `nodes[${i}]`, `${nameOf(node.id)} can never run: no trigger leads to it.`, { nodeId: node.id });
		});
	}

	return issues;
}
