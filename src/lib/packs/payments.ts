import type { NodeConfig, NodePack } from '$lib/flow/types';

/**
 * Example pack: treasury payouts guarded by a multisig approval.
 * Everything here runs as a simulation in the editor; swap `run` for real integrations.
 */

const num = (v: unknown) => (typeof v === 'number' ? v : Number(v));
const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function parseRecipients(text: unknown) {
	const rows: { to: string; amount: number }[] = [];
	const bad: number[] = [];
	String(text ?? '')
		.split('\n')
		.map((l) => l.trim())
		.forEach((line, i) => {
			if (!line) return;
			const [to, amount] = line.split(',').map((p) => p.trim());
			const value = Number(amount);
			if (!to || !Number.isFinite(value) || value <= 0) bad.push(i + 1);
			else rows.push({ to, amount: value });
		});
	return { rows, bad, total: rows.reduce((s, r) => s + r.amount, 0) };
}

const signerList = (config: NodeConfig) =>
	String(config.signers ?? '')
		.split('\n')
		.map((s) => s.trim())
		.filter(Boolean);

const compare = (left: number, op: string, right: number) =>
	op === '>' ? left > right : op === '>=' ? left >= right : op === '<' ? left < right : op === '<=' ? left <= right : left === right;

const VARIABLES = [
	{ value: 'runwayMonths', label: 'Runway (months)' },
	{ value: 'balance', label: 'Vault balance' },
	{ value: 'lastTransferTotal', label: 'Last transfer total' }
];

export const paymentsPack: NodePack = {
	id: 'payments',
	label: 'Payments',
	categories: [
		{ id: 'triggers', label: 'Triggers' },
		{ id: 'logic', label: 'Logic & agents' },
		{ id: 'safety', label: 'Approvals' },
		{ id: 'actions', label: 'Actions' }
	],
	sampleVars: { balance: 684250, monthlyBurn: 61000, token: 'USDC' },
	nodes: [
		{
			kind: 'trigger.schedule',
			title: 'Schedule',
			description: 'Start on a repeating schedule.',
			category: 'triggers',
			icon: 'clock',
			trigger: true,
			defaults: { every: 'month', day: 1, time: '09:00' },
			fields: [
				{
					key: 'every',
					label: 'Repeat',
					type: 'select',
					options: [
						{ value: 'day', label: 'Every day' },
						{ value: 'week', label: 'Every week' },
						{ value: 'month', label: 'Every month' }
					]
				},
				{ key: 'day', label: 'Day of month', type: 'number', min: 1, max: 28, showIf: { key: 'every', equals: ['month'] } },
				{ key: 'time', label: 'Time', type: 'text', placeholder: '09:00', required: true, mono: true }
			],
			summary: (c) => (c.every === 'month' ? `Monthly on day ${c.day} · ${c.time}` : `Every ${c.every} · ${c.time}`)
		},
		{
			kind: 'trigger.webhook',
			title: 'Webhook',
			description: 'Start when another app calls a URL.',
			category: 'triggers',
			icon: 'webhook',
			trigger: true,
			defaults: { path: 'invoice-paid' },
			fields: [{ key: 'path', label: 'Path', type: 'text', required: true, mono: true, help: 'POST /hooks/<path>' }],
			summary: (c) => `POST /hooks/${c.path}`
		},
		{
			kind: 'trigger.manual',
			title: 'Manual',
			description: 'Start by pressing Run.',
			category: 'triggers',
			icon: 'hand',
			trigger: true,
			summary: () => 'Started by a person'
		},
		{
			kind: 'agent.check',
			title: 'Agent check',
			description: 'Let an agent inspect the treasury before money moves.',
			category: 'logic',
			icon: 'sparkle',
			defaults: { check: 'runway', instructions: 'Estimate runway from the vault balance and the last 90 days of spend.' },
			fields: [
				{
					key: 'check',
					label: 'Check',
					type: 'select',
					options: [
						{ value: 'runway', label: 'Runway' },
						{ value: 'anomaly', label: 'Unusual amounts' }
					]
				},
				{ key: 'instructions', label: 'Instructions', type: 'textarea', required: true }
			],
			summary: (c) => (c.check === 'runway' ? 'Estimates runway' : 'Looks for unusual amounts'),
			run: (c, ctx) => {
				if (c.check === 'runway') {
					const months = num(ctx.vars.balance) / num(ctx.vars.monthlyBurn);
					ctx.vars.runwayMonths = Math.round(months * 10) / 10;
					return { next: 'out', message: `Runway is ${ctx.vars.runwayMonths} months` };
				}
				ctx.vars.anomaly = false;
				return { next: 'out', message: 'Nothing unusual found' };
			}
		},
		{
			kind: 'logic.condition',
			title: 'If',
			description: 'Branch on a value.',
			category: 'logic',
			icon: 'split',
			outputs: [
				{ id: 'true', label: 'Yes' },
				{ id: 'false', label: 'No' }
			],
			defaults: { variable: 'runwayMonths', operator: '>', value: 6 },
			fields: [
				{ key: 'variable', label: 'Value', type: 'select', options: VARIABLES },
				{
					key: 'operator',
					label: 'Is',
					type: 'select',
					options: ['>', '>=', '<', '<=', '='].map((o) => ({ value: o, label: o }))
				},
				{ key: 'value', label: 'Than', type: 'number', required: true }
			],
			summary: (c) => `${VARIABLES.find((v) => v.value === c.variable)?.label ?? c.variable} ${c.operator} ${c.value}`,
			run: (c, ctx) => {
				const left = ctx.vars[String(c.variable)];
				if (left === undefined) return { status: 'error', message: `No value for "${c.variable}" yet — add a step that sets it.` };
				const pass = compare(num(left), String(c.operator), num(c.value));
				return { next: pass ? 'true' : 'false', message: `${left} ${c.operator} ${c.value} → ${pass ? 'yes' : 'no'}` };
			}
		},
		{
			kind: 'approval.multisig',
			title: 'Approval',
			description: 'Wait until enough signers approve.',
			category: 'safety',
			icon: 'signers',
			outputs: [
				{ id: 'approved', label: 'Approved' },
				{ id: 'rejected', label: 'Rejected' }
			],
			defaults: { threshold: 2, signers: 'eren.eth\nmert.eth\ndeniz.eth', expiresHours: 48 },
			fields: [
				{ key: 'signers', label: 'Signers', type: 'textarea', required: true, mono: true, help: 'One address or name per line' },
				{ key: 'threshold', label: 'Approvals needed', type: 'number', min: 1, required: true },
				{ key: 'expiresHours', label: 'Expires after', type: 'number', min: 1, suffix: 'hours' }
			],
			check: (c) => {
				const count = signerList(c).length;
				return num(c.threshold) > count ? `needs ${c.threshold} approvals but only has ${count} signers.` : null;
			},
			summary: (c) => `${c.threshold} of ${signerList(c).length} signers`,
			run: (c) => ({ next: 'approved', message: `Approved by ${c.threshold} of ${signerList(c).length} (simulated)` })
		},
		{
			kind: 'action.transfer',
			title: 'Send',
			description: 'Transfer stablecoins to one or more recipients.',
			category: 'actions',
			icon: 'send',
			defaults: { token: 'USDC', recipients: '0x2d8…a17, 9500\n0x4c1…08b, 8200', memo: '' },
			fields: [
				{
					key: 'token',
					label: 'Token',
					type: 'select',
					options: [
						{ value: 'USDC', label: 'USDC' },
						{ value: 'EURC', label: 'EURC' }
					]
				},
				{ key: 'recipients', label: 'Recipients', type: 'textarea', required: true, mono: true, help: 'One per line: address, amount' },
				{ key: 'memo', label: 'Memo', type: 'text', placeholder: 'Shown to signers' }
			],
			requiresUpstream: { kinds: ['approval.multisig'], message: 'money can only move after an Approval step.' },
			check: (c) => {
				const { bad } = parseRecipients(c.recipients);
				return bad.length ? `recipient line ${bad.join(', ')} should look like "address, amount".` : null;
			},
			summary: (c) => {
				const { rows, total } = parseRecipients(c.recipients);
				return `${fmt(total)} ${c.token} → ${rows.length} ${rows.length === 1 ? 'recipient' : 'recipients'}`;
			},
			run: (c, ctx) => {
				const { total } = parseRecipients(c.recipients);
				const balance = num(ctx.vars.balance);
				if (total > balance) return { status: 'error', message: `Needs ${fmt(total)} but the vault holds ${fmt(balance)}` };
				ctx.vars.balance = balance - total;
				ctx.vars.lastTransferTotal = total;
				return { next: 'out', message: `Sent ${fmt(total)} ${c.token} · balance ${fmt(balance - total)}` };
			}
		},
		{
			kind: 'action.notify',
			title: 'Notify',
			description: 'Send a message to your team.',
			category: 'actions',
			icon: 'bell',
			defaults: { channel: 'telegram', message: 'Payroll is on hold: runway dropped below target.' },
			fields: [
				{
					key: 'channel',
					label: 'Channel',
					type: 'select',
					options: [
						{ value: 'telegram', label: 'Telegram' },
						{ value: 'slack', label: 'Slack' },
						{ value: 'email', label: 'Email' }
					]
				},
				{ key: 'message', label: 'Message', type: 'textarea', required: true }
			],
			summary: (c) => `via ${String(c.channel).replace(/^./, (s) => s.toUpperCase())}`,
			run: (c) => ({ next: 'out', message: `Posted to ${c.channel}` })
		},
		{
			kind: 'logic.delay',
			title: 'Wait',
			description: 'Pause before the next step.',
			category: 'logic',
			icon: 'hourglass',
			defaults: { amount: 1, unit: 'days' },
			fields: [
				{ key: 'amount', label: 'Wait for', type: 'number', min: 1, required: true },
				{
					key: 'unit',
					label: 'Unit',
					type: 'select',
					options: ['minutes', 'hours', 'days'].map((u) => ({ value: u, label: u }))
				}
			],
			summary: (c) => `${c.amount} ${c.unit}`,
			run: (c) => ({ next: 'out', message: `Waited ${c.amount} ${c.unit} (skipped in test)` })
		}
	]
};
