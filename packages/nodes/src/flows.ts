import { defineNode, f } from '@arcflow/core';

export const callFlow = defineNode({
	kind: 'flow.call',
	title: 'Run flow',
	description:
		"Runs another flow and continues with its result. Waits while that flow waits. The engine loads flows by id from its flows source.",
	category: 'flow',
	icon: 'layers',
	outputs: [{ id: 'out' }, { id: 'error', label: 'Error' }],
	config: {
		flow: f.string({ label: 'Flow id', placeholder: 'send-invoice', mono: true }),
		input: f.json({ optional: true, description: "Becomes the flow's trigger payload. Defaults to this step's input." })
	},
	summary: (c) => `Runs ${c.flow}`,
	run: (ctx) => ({ call: { flow: ctx.config.flow, input: ctx.config.input ?? ctx.input } })
});
