import type { FlowDocument } from '$lib/flow/types';

/** Example: pay the team every month, but only when runway is healthy and signers approve. */
export const sampleFlow: FlowDocument = {
	version: 1,
	name: 'Monthly payroll',
	nodes: [
		{ id: 'schedule', kind: 'trigger.schedule', position: { x: 0, y: 140 }, config: { every: 'month', day: 1, time: '09:00' } },
		{
			id: 'runway',
			kind: 'agent.check',
			label: 'Check runway',
			position: { x: 280, y: 140 },
			config: { check: 'runway', instructions: 'Estimate runway from the vault balance and the last 90 days of spend.' }
		},
		{
			id: 'healthy',
			kind: 'logic.condition',
			label: 'Runway healthy?',
			position: { x: 560, y: 128 },
			config: { variable: 'runwayMonths', operator: '>', value: 6 }
		},
		{
			id: 'approve',
			kind: 'approval.multisig',
			label: 'Founders approve',
			position: { x: 840, y: 20 },
			config: { signers: 'eren.eth\nmert.eth\ndeniz.eth', threshold: 2, expiresHours: 48 }
		},
		{
			id: 'pay',
			kind: 'action.transfer',
			label: 'Pay the team',
			position: { x: 1120, y: -20 },
			config: {
				token: 'USDC',
				recipients: '0x2d8…a17, 9500\n0x4c1…08b, 8200\n0x8e0…d52, 7400\n0x31f…9b0, 6800\n0xa74…1ce, 5900\n0x5b2…e67, 5000',
				memo: 'Payroll'
			}
		},
		{
			id: 'rejected',
			kind: 'action.notify',
			label: 'Tell founders',
			position: { x: 1120, y: 180 },
			config: { channel: 'telegram', message: 'Payroll was rejected by signers.' }
		},
		{
			id: 'hold',
			kind: 'action.notify',
			label: 'Hold payroll',
			position: { x: 840, y: 310 },
			config: { channel: 'telegram', message: 'Payroll is on hold: runway dropped below 6 months.' }
		}
	],
	edges: [
		{ id: 'e1', source: 'schedule', sourceHandle: 'out', target: 'runway', targetHandle: 'in' },
		{ id: 'e2', source: 'runway', sourceHandle: 'out', target: 'healthy', targetHandle: 'in' },
		{ id: 'e3', source: 'healthy', sourceHandle: 'true', target: 'approve', targetHandle: 'in' },
		{ id: 'e4', source: 'healthy', sourceHandle: 'false', target: 'hold', targetHandle: 'in' },
		{ id: 'e5', source: 'approve', sourceHandle: 'approved', target: 'pay', targetHandle: 'in' },
		{ id: 'e6', source: 'approve', sourceHandle: 'rejected', target: 'rejected', targetHandle: 'in' }
	]
};
