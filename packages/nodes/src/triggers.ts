import { defineNode, f } from '@arcflow/core';

export const manualTrigger = defineNode({
	kind: 'trigger.manual',
	title: 'Manual trigger',
	description: 'Starts the flow when someone runs it by hand. Outputs the run payload.',
	category: 'triggers',
	icon: 'hand',
	trigger: true,
	config: {
		sample: f.json({
			optional: true,
			label: 'Test payload',
			description: 'Used when a run has no payload, for example in test runs.'
		})
	},
	summary: () => 'Run by hand',
	run: (ctx) => ({ output: ctx.input ?? ctx.config.sample ?? {} })
});

/** Payload a webhook trigger outputs. Produced by the HTTP server that receives the call. */
export interface WebhookPayload {
	method: string;
	path: string;
	headers: Record<string, string>;
	query: Record<string, string>;
	body: unknown;
}

export const webhookTrigger = defineNode({
	kind: 'trigger.webhook',
	title: 'Webhook',
	description: 'Starts the flow when another app sends an HTTP request. Outputs { method, path, headers, query, body }.',
	category: 'triggers',
	icon: 'webhook',
	trigger: true,
	config: {
		path: f.string({
			pattern: '^[A-Za-z0-9][A-Za-z0-9/_-]*$',
			placeholder: 'orders/created',
			mono: true,
			description: 'Served at /hooks/<path>.'
		}),
		method: f.enum(['POST', 'GET', 'PUT', 'PATCH', 'DELETE'], { default: 'POST' }),
		respond: f.enum(['immediately', 'when-finished', 'respond-step'], {
			default: 'immediately',
			label: 'Respond',
			labels: {
				immediately: 'Right away (202)',
				'when-finished': 'When the flow finishes, with its result',
				'respond-step': 'From a "Respond to webhook" step'
			}
		})
	},
	summary: (c) => `${c.method} /hooks/${c.path}`,
	run: (ctx) => ({ output: ctx.input ?? { method: ctx.config.method, path: ctx.config.path, headers: {}, query: {}, body: null } })
});
