import { defineNode, definePack, f, type Services } from '@arcsig-labs/core';

/**
 * Treasury steps: runway checks, multisig approvals, stablecoin transfers and team notifications.
 * Combine with `@arcsig-labs/nodes` for triggers, branching and HTTP.
 */

export interface Recipient {
	to: string;
	amount: number;
}

/** What the payments steps need from your app when running live. */
export interface PaymentServices {
	/** Vault balance in token units. */
	getBalance(token: string): Promise<number>;
	/** Average monthly outflow in token units. Falls back to `vars.monthlyBurn`. */
	getMonthlyBurn?(token: string): Promise<number>;
	/**
	 * Opens a multisig approval request. The run waits; call
	 * `engine.resume(flow, state, { nodeId, data: { approved: boolean } })` when it settles.
	 */
	requestApproval(request: {
		runId: string;
		nodeId: string;
		signers: string[];
		threshold: number;
		expiresHours: number;
		note?: string;
	}): Promise<{ requestId: string }>;
	transfer(request: { runId: string; nodeId: string; token: string; recipients: Recipient[]; memo?: string }): Promise<{ txHash: string }>;
	notify(request: { channel: string; message: string }): Promise<void>;
}

declare module '@arcsig-labs/core' {
	interface Services {
		payments?: PaymentServices;
	}
}

const TOKENS = ['USDC', 'EURC'] as const;

function payments(services: Services): PaymentServices {
	if (!services.payments) {
		throw new Error('services.payments is not configured. Pass it to createEngine(), or run with mode "simulate".');
	}
	return services.payments;
}

const money = (value: number) => value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const total = (recipients: readonly Recipient[]) => recipients.reduce((sum, r) => sum + r.amount, 0);
const asObject = (value: unknown) => (value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {});

function runwayResult(vars: Record<string, unknown>, balance: number, burn: number, token: string) {
	const runwayMonths = burn > 0 ? Math.round((balance / burn) * 10) / 10 : null;
	vars.balance = balance;
	vars.runwayMonths = runwayMonths;
	return {
		output: { token, balance, monthlyBurn: burn, runwayMonths },
		message: runwayMonths === null ? `${money(balance)} ${token}, no burn yet` : `Runway is ${runwayMonths} months`
	};
}

export const runway = defineNode({
	kind: 'treasury.runway',
	title: 'Check runway',
	description: 'Reads the vault balance and estimates how many months of spending it covers. Outputs { token, balance, monthlyBurn, runwayMonths }.',
	category: 'treasury',
	icon: 'sparkle',
	config: {
		token: f.enum(TOKENS, { default: 'USDC' })
	},
	summary: (c) => `Estimates ${c.token} runway`,
	run: async (ctx) => {
		const services = payments(ctx.services);
		const balance = await services.getBalance(ctx.config.token);
		const burn = services.getMonthlyBurn ? await services.getMonthlyBurn(ctx.config.token) : Number(ctx.vars.monthlyBurn ?? 0);
		return runwayResult(ctx.vars, balance, burn, ctx.config.token);
	},
	simulate: (ctx) => runwayResult(ctx.vars, Number(ctx.vars.balance ?? 0), Number(ctx.vars.monthlyBurn ?? 0), ctx.config.token)
});

export const approval = defineNode({
	kind: 'approval.multisig',
	title: 'Approval',
	description: 'Asks signers to approve and waits until enough of them do.',
	category: 'approvals',
	icon: 'signers',
	outputs: [
		{ id: 'approved', label: 'Approved' },
		{ id: 'rejected', label: 'Rejected' }
	],
	config: {
		signers: f.list(f.string({ mono: true, placeholder: '0x… or name.eth' }), { minItems: 1, description: 'Addresses or names allowed to sign.' }),
		threshold: f.number({ integer: true, min: 1, default: 2, label: 'Approvals needed' }),
		expiresHours: f.number({ integer: true, min: 1, default: 48, label: 'Expires after', unit: 'hours' }),
		note: f.text({ optional: true, label: 'Note for signers' })
	},
	check: (c) =>
		Array.isArray(c.signers) && c.threshold > c.signers.length ? `needs ${c.threshold} approvals but lists only ${c.signers.length} signers.` : null,
	summary: (c) => `${c.threshold} of ${Array.isArray(c.signers) ? c.signers.length : '?'} signers`,
	run: async (ctx) => {
		const { signers, threshold, expiresHours, note } = ctx.config;
		if (ctx.resumed) {
			const data = asObject(ctx.resumed.data);
			return { port: data.approved ? 'approved' : 'rejected', output: data, message: data.approved ? 'Approved' : 'Rejected' };
		}
		const { requestId } = await payments(ctx.services).requestApproval({ runId: ctx.runId, nodeId: ctx.key, signers, threshold, expiresHours, note });
		return { wait: { reason: 'approval', data: { requestId } }, message: `Waiting for ${threshold} of ${signers.length} signers` };
	},
	simulate: (ctx) => ({
		port: 'approved',
		output: { approved: true, signedBy: ctx.config.signers.slice(0, ctx.config.threshold) },
		message: `Approved by ${ctx.config.threshold} of ${ctx.config.signers.length} (simulated)`
	})
});

export const transfer = defineNode({
	kind: 'action.transfer',
	title: 'Send',
	description: 'Sends stablecoins to one or more recipients. Never retried automatically.',
	category: 'actions',
	icon: 'send',
	config: {
		token: f.enum(TOKENS, { default: 'USDC' }),
		recipients: f.list(
			{
				to: f.string({ label: 'Address', mono: true, minLength: 3, placeholder: '0x… or name.eth' }),
				amount: f.number({ min: 0.000001 })
			},
			{ minItems: 1 }
		),
		memo: f.string({ optional: true, placeholder: 'Shown in the ledger' })
	},
	requires: { upstream: ['approval.multisig'], message: 'money can only move after an Approval step.' },
	summary: (c) => {
		const list = Array.isArray(c.recipients) ? c.recipients : [];
		return `${money(total(list))} ${c.token} → ${list.length} ${list.length === 1 ? 'recipient' : 'recipients'}`;
	},
	run: async (ctx) => {
		const { token, recipients, memo } = ctx.config;
		const services = payments(ctx.services);
		const sum = total(recipients);
		const balance = await services.getBalance(token);
		if (sum > balance) throw new Error(`Needs ${money(sum)} ${token} but the vault holds ${money(balance)}.`);
		const { txHash } = await services.transfer({ runId: ctx.runId, nodeId: ctx.key, token, recipients, memo });
		return { output: { txHash, token, total: sum, recipients: recipients.length }, message: `Sent ${money(sum)} ${token}` };
	},
	simulate: (ctx) => {
		const { token, recipients } = ctx.config;
		const sum = total(recipients);
		const balance = Number(ctx.vars.balance ?? 0);
		if (sum > balance) throw new Error(`Needs ${money(sum)} ${token} but the vault holds ${money(balance)}.`);
		ctx.vars.balance = balance - sum;
		return {
			output: { txHash: '0xsimulated', token, total: sum, recipients: recipients.length },
			message: `Sent ${money(sum)} ${token} · balance ${money(balance - sum)}`
		};
	}
});

export const notify = defineNode({
	kind: 'action.notify',
	title: 'Notify',
	description: 'Sends a message to your team. Supports expressions.',
	category: 'actions',
	icon: 'bell',
	retry: { attempts: 3, delayMs: 500 },
	config: {
		channel: f.enum(['telegram', 'slack', 'email'], { default: 'telegram', labels: { telegram: 'Telegram', slack: 'Slack', email: 'Email' } }),
		message: f.text({ placeholder: 'Payroll sent: {{ steps.pay.output.total }} USDC' })
	},
	summary: (c) => `via ${c.channel.charAt(0).toUpperCase()}${c.channel.slice(1)}`,
	run: async (ctx) => {
		await payments(ctx.services).notify({ channel: ctx.config.channel, message: ctx.config.message });
		return { output: ctx.input, message: `Posted to ${ctx.config.channel}` };
	},
	simulate: (ctx) => ({ output: ctx.input, message: `Would post: “${ctx.config.message}”` })
});

export const paymentsPack = definePack({
	id: 'payments',
	label: 'Payments',
	description: 'Treasury payouts guarded by multisig approval.',
	categories: [
		{ id: 'treasury', label: 'Treasury' },
		{ id: 'approvals', label: 'Approvals' },
		{ id: 'actions', label: 'Actions' }
	],
	nodes: [runway, approval, transfer, notify],
	sampleVars: { balance: 684_250, monthlyBurn: 61_000 }
});
