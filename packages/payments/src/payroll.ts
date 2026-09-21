import { createRegistry, type Flow } from '@arcsig-labs/core';
import { standardSteps } from '@arcsig-labs/nodes';
import { paymentsPack } from './pack.js';

/** Standard steps plus the payments pack. */
export const paymentsRegistry = createRegistry([standardSteps, paymentsPack]);

/**
 * Pays the team on the 1st — but only when runway is above six months and two founders approve.
 * Written with the builder API; the result is plain JSON.
 */
export function createPayrollFlow(registry = paymentsRegistry): Flow {
	const flow = registry.flow('Monthly payroll').description('Pay the team on the 1st when runway is healthy and founders approve.');

	const schedule = flow.add('trigger.schedule', { cron: '0 9 1 * *', timezone: 'UTC' }, { id: 'schedule', label: 'First of the month' });
	const runway = flow.add('treasury.runway', { token: 'USDC' }, { id: 'runway' });
	const healthy = flow.add(
		'logic.if',
		{ conditions: [{ left: '{{ steps.runway.output.runwayMonths }}', operator: 'gt', right: 6 }] },
		{ id: 'healthy', label: 'Runway healthy?' }
	);
	const approve = flow.add(
		'approval.multisig',
		{ signers: ['alice.eth', 'bob.eth', 'carol.eth'], threshold: 2, note: 'Monthly payroll' },
		{ id: 'approve', label: 'Founders approve' }
	);
	const pay = flow.add(
		'action.transfer',
		{
			token: 'USDC',
			recipients: [
				{ to: 'bob.eth', amount: 9_500 },
				{ to: 'carol.eth', amount: 8_200 },
				{ to: 'dave.eth', amount: 7_400 },
				{ to: 'erin.eth', amount: 6_800 },
				{ to: 'frank.eth', amount: 5_900 },
				{ to: 'grace.eth', amount: 5_000 }
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
