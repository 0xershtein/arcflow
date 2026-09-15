import { createRegistry, type Flow } from '@arcflow/core';
import { paymentsPack } from './pack.js';

export const paymentsRegistry = createRegistry([paymentsPack]);

/**
 * Pays the team on the 1st — but only when runway is above six months and two founders approve.
 * Written with the builder API; the result is plain JSON.
 */
export function createPayrollFlow(registry = paymentsRegistry): Flow {
	const flow = registry.flow('Monthly payroll').description('Pay the team on the 1st when runway is healthy and founders approve.');

	const schedule = flow.add('trigger.schedule', { every: 'month', day: 1, time: '09:00' }, { id: 'schedule' });
	const runway = flow.add('treasury.runway', { token: 'USDC' }, { id: 'runway' });
	const healthy = flow.add(
		'logic.condition',
		{ value: '{{ steps.runway.output.runwayMonths }}', operator: '>', than: 6 },
		{ id: 'healthy', label: 'Runway healthy?' }
	);
	const approve = flow.add(
		'approval.multisig',
		{ signers: ['eren.eth', 'mert.eth', 'deniz.eth'], threshold: 2, note: 'September payroll' },
		{ id: 'approve', label: 'Founders approve' }
	);
	const pay = flow.add(
		'action.transfer',
		{
			token: 'USDC',
			recipients: [
				{ to: 'mert.eth', amount: 9_500 },
				{ to: 'deniz.eth', amount: 8_200 },
				{ to: 'selin.eth', amount: 7_400 },
				{ to: 'burak.eth', amount: 6_800 },
				{ to: 'ayse.eth', amount: 5_900 },
				{ to: 'can.eth', amount: 5_000 }
			],
			memo: 'Payroll'
		},
		{ id: 'pay', label: 'Pay the team' }
	);
	const paid = flow.add('action.notify', { message: 'Payroll sent: {{ steps.pay.output.total }} USDC.' }, { id: 'paid', label: 'Confirm payroll' });
	const rejected = flow.add('action.notify', { message: 'Payroll was rejected by signers.' }, { id: 'rejected', label: 'Tell founders' });
	const hold = flow.add(
		'action.notify',
		{ message: 'Payroll on hold: runway is {{ steps.runway.output.runwayMonths }} months.' },
		{ id: 'hold', label: 'Hold payroll' }
	);

	schedule.to(runway).to(healthy);
	healthy.on('true').to(approve).on('approved').to(pay).to(paid);
	approve.on('rejected').to(rejected);
	healthy.on('false').to(hold);

	return flow.build();
}
