import type { CategoryDef, NodeDefinition, NodePack, PortDef } from './types';

const DEFAULT_OUTPUTS: PortDef[] = [{ id: 'out' }];

export function createRegistry(packs: NodePack[]) {
	const definitions = new Map<string, NodeDefinition>();
	const categories: CategoryDef[] = [];
	const sampleVars: Record<string, unknown> = {};

	for (const pack of packs) {
		for (const category of pack.categories) {
			if (!categories.some((c) => c.id === category.id)) categories.push(category);
		}
		for (const def of pack.nodes) {
			if (definitions.has(def.kind)) {
				throw new Error(`Node kind "${def.kind}" is registered twice (pack "${pack.id}").`);
			}
			if (!pack.categories.some((c) => c.id === def.category) && !categories.some((c) => c.id === def.category)) {
				throw new Error(`Node kind "${def.kind}" uses unknown category "${def.category}".`);
			}
			definitions.set(def.kind, def);
		}
		Object.assign(sampleVars, pack.sampleVars);
	}

	return {
		categories,
		sampleVars,
		all: () => [...definitions.values()],
		get: (kind: string) => definitions.get(kind),
		outputsOf: (def: NodeDefinition) => def.outputs ?? DEFAULT_OUTPUTS
	};
}

export type Registry = ReturnType<typeof createRegistry>;
