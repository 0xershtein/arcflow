import { describe, expect, it, vi } from 'vitest';
import { createEngine, waitingSteps } from '@arcsig-labs/core';
import { createPayrollFlow, paymentsRegistry, type PaymentServices } from '../src/index.js';

function fakeServices(balance = 684_250, burn = 61_000) {
	return {
		getBalance: vi.fn(async () => balance),
		getMonthlyBurn: vi.fn(async () => burn),
		requestApproval: vi.fn(async () => ({ requestId: 'req-1' })),
		transfer: vi.fn(async () => ({ txHash: '0xabc' })),
		notify: vi.fn(async () => {})
	} satisfies PaymentServices;
}

describe('payroll flow', () => {
	it('is valid without warnings', () => {
		expect(paymentsRegistry.validate(createPayrollFlow())).toEqual([]);
	});

	it('simulates end to end without services', async () => {
		const run = await createEngine(paymentsRegistry).start(createPayrollFlow(), { mode: 'simulate' });
		expect(run.status).toBe('completed');
		expect(run.steps.runway.output).toMatchObject({ runwayMonths: 11.2 });
		expect(run.vars.balance).toBe(684_250 - 42_800);
		expect(run.steps.hold.status).toBe('skipped');
		expect(run.steps.rejected.status).toBe('skipped');
	});

	it('waits for signers when live, then pays and confirms', async () => {
		const services = fakeServices();
		const engine = createEngine(paymentsRegistry, { services: { payments: services } });
		const flow = createPayrollFlow();

		const waiting = await engine.start(flow);
		expect(waiting.status).toBe('waiting');
		expect(waitingSteps(waiting)).toEqual([{ key: 'approve', nodeId: 'approve', reason: 'approval', data: { requestId: 'req-1' } }]);
		expect(services.requestApproval).toHaveBeenCalledWith(expect.objectContaining({ threshold: 2, signers: ['alice.eth', 'bob.eth', 'carol.eth'] }));
		expect(services.transfer).not.toHaveBeenCalled();

		const done = await engine.resume(flow, waiting, { nodeId: 'approve', data: { approved: true } });
		expect(done.status).toBe('completed');
		expect(services.transfer).toHaveBeenCalledOnce();
		expect(services.transfer).toHaveBeenCalledWith(expect.objectContaining({ token: 'USDC', memo: 'Payroll' }));
		expect(services.notify).toHaveBeenCalledWith({ channel: 'telegram', message: 'Payroll sent: 42800 USDC.' });
	});

	it('holds payroll when runway is short', async () => {
		const services = fakeServices(200_000);
		const run = await createEngine(paymentsRegistry, { services: { payments: services } }).start(createPayrollFlow());
		expect(run.status).toBe('completed');
		expect(services.requestApproval).not.toHaveBeenCalled();
		expect(services.notify).toHaveBeenCalledWith({ channel: 'telegram', message: 'Payroll on hold: runway is 3.3 months.' });
	});

	it('refuses to send more than the vault holds', async () => {
		const services = fakeServices();
		services.getBalance.mockResolvedValueOnce(684_250).mockResolvedValueOnce(1_000);
		const engine = createEngine(paymentsRegistry, { services: { payments: services } });
		const flow = createPayrollFlow();
		const waiting = await engine.start(flow);
		const run = await engine.resume(flow, waiting, { nodeId: 'approve', data: { approved: true } });
		expect(run.status).toBe('failed');
		expect(run.error).toEqual({ nodeId: 'pay', message: 'Needs 42,800.00 USDC but the vault holds 1,000.00.' });
		expect(services.transfer).not.toHaveBeenCalled();
	});

	it('explains itself to LLMs', () => {
		const catalog = paymentsRegistry.describe();
		expect(catalog).toContain('### `approval.multisig` — Approval');
		expect(catalog).toContain('`recipients`: list of { to: text, amount: number ≥ 0.000001 } (at least 1)');
	});
});
