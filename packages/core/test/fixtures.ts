import { createRegistry, defineNode, definePack, f } from '../src/index.js';

export const start = defineNode({
	kind: 'test.start',
	title: 'Start',
	description: 'Starts the flow.',
	category: 'test',
	trigger: true,
	run: (ctx) => ({ output: ctx.input })
});

export const compare = defineNode({
	kind: 'test.if',
	title: 'If',
	description: 'Compares two numbers.',
	category: 'test',
	outputs: [
		{ id: 'true', label: 'Yes' },
		{ id: 'false', label: 'No' }
	],
	config: {
		value: f.number(),
		than: f.number({ default: 0 })
	},
	run: (ctx) => ({ port: ctx.config.value > ctx.config.than ? 'true' : 'false' })
});

export const approve = defineNode({
	kind: 'test.approve',
	title: 'Approve',
	description: 'Waits for signers.',
	category: 'test',
	outputs: [{ id: 'approved' }, { id: 'rejected' }],
	config: {
		signers: f.list(f.string(), { minItems: 1 }),
		threshold: f.number({ integer: true, min: 1, default: 1 })
	},
	check: (config) => (config.threshold > config.signers.length ? 'threshold is higher than the number of signers' : null),
	run: (ctx) => {
		if (!ctx.resumed) return { wait: { reason: 'approval', data: { signers: ctx.config.signers } } };
		const data = ctx.resumed.data as { approved: boolean };
		return { port: data.approved ? 'approved' : 'rejected', output: data };
	},
	simulate: () => ({ port: 'approved' })
});

export const pay = defineNode({
	kind: 'test.pay',
	title: 'Pay',
	description: 'Moves money.',
	category: 'test',
	config: {
		amount: f.number({ min: 0 }),
		memo: f.string({ optional: true })
	},
	requires: { upstream: ['test.approve'], message: 'needs an approval first' },
	run: (ctx) => {
		ctx.vars.balance = Number(ctx.vars.balance) - ctx.config.amount;
		return { output: { paid: ctx.config.amount, memo: ctx.config.memo } };
	}
});

export const flaky = defineNode({
	kind: 'test.flaky',
	title: 'Flaky',
	description: 'Fails a few times first.',
	category: 'test',
	outputs: [{ id: 'out' }, { id: 'error' }],
	retry: { attempts: 3 },
	config: { failTimes: f.number({ integer: true, default: 1 }) },
	run: (ctx) => {
		if (ctx.attempt <= ctx.config.failTimes) throw new Error(`boom ${ctx.attempt}`);
		return { port: 'out', output: { attempt: ctx.attempt } };
	}
});

export const note = defineNode({
	kind: 'test.note',
	title: 'Note',
	description: 'Records a message.',
	category: 'test',
	config: { text: f.text() },
	run: (ctx) => ({ output: { text: ctx.config.text } })
});

export const testPack = definePack({
	id: 'test',
	label: 'Test',
	categories: [{ id: 'test', label: 'Test steps' }],
	nodes: [start, compare, approve, pay, flaky, note],
	sampleVars: { balance: 100 }
});

export const registry = createRegistry([testPack]);

/** start → if(value > 5) → approve → pay → note ; if false → note-low */
export function paymentFlow(value = 10) {
	const flow = registry.flow('Payment');
	const begin = flow.add('test.start', {}, { id: 'start' });
	const check = flow.add('test.if', { value, than: 5 }, { id: 'check' });
	const sign = flow.add('test.approve', { signers: ['a', 'b'], threshold: 2 }, { id: 'sign' });
	const send = flow.add('test.pay', { amount: 40, memo: 'rent' }, { id: 'send' });
	const done = flow.add('test.note', { text: 'Paid {{ steps.send.output.paid }}' }, { id: 'done' });
	const low = flow.add('test.note', { text: 'Too low' }, { id: 'low' });
	begin.to(check);
	check.on('true').to(sign).on('approved').to(send).to(done);
	check.on('false').to(low);
	return flow;
}
