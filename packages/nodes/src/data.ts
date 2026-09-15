import { defineNode, f } from '@arcflow/core';
import { isRecord, setPath } from './util.js';

export const setFields = defineNode({
	kind: 'data.set',
	title: 'Set fields',
	description: 'Builds an object from named values. Field names can be paths like "customer.email"; values can be expressions.',
	category: 'data',
	icon: 'pencil',
	config: {
		fields: f.list(
			{
				name: f.string({ placeholder: 'customer.email', mono: true }),
				value: f.json({ optional: true, placeholder: '{{ input.email }}' })
			},
			{ minItems: 1 }
		),
		keepInput: f.boolean({
			default: true,
			label: 'Keep incoming fields',
			description: 'Start from the incoming object and add or overwrite these fields.'
		})
	},
	summary: (c) => (Array.isArray(c.fields) ? c.fields.map((field) => field.name).join(', ') : 'Set fields'),
	run: (ctx) => {
		const output: Record<string, unknown> = ctx.config.keepInput && isRecord(ctx.input) ? structuredClone(ctx.input) : {};
		for (const { name, value } of ctx.config.fields) setPath(output, name, value);
		return { output };
	}
});
