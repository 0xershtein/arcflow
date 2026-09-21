import type { Flow } from '@arcsig-labs/core';
import { standardRegistry } from '@arcsig-labs/nodes';

/**
 * A short flow for the embedded demo: wide enough to show connections and ports,
 * small enough to stay readable in a page.
 */
export function createDemoFlow(): Flow {
	const flow = standardRegistry.flow('Is the repo up?').description('Ask the GitHub API about this repository and report whether it answered.');

	const start = flow.add('trigger.manual', {}, { id: 'start' });
	// A real endpoint that allows browser requests, so Test run on the page goes through.
	const check = flow.add('http.request', { url: 'https://api.github.com/repos/arcsig-labs/arcflow' }, { id: 'status', label: 'Fetch status' });
	const report = flow.add(
		'code.javascript',
		{ code: ['const ok = input.status === 200;', 'return { ok, checkedAt: new Date().toISOString() };'].join('\n') },
		{ id: 'report', label: 'Is it up?' }
	);

	start.to(check).to(report);
	return flow.build();
}

/** The demo flow with a sticky note, so the playground shows annotations as well as steps. */
export function createPlaygroundFlow(): Flow {
	return {
		...createDemoFlow(),
		annotations: [
			{
				id: 'note',
				text: 'Press Test run. Then turn the inspector on, click “Fetch status” and open Output to see what came back.',
				position: { x: 300, y: 220 },
				width: 260,
				height: 96
			}
		]
	};
}

/**
 * A flow that only reads run variables, for the `vars` and `summaries` demo. Nothing in it
 * leaves the browser, so a test run never depends on the network.
 */
export function createVarsFlow(): Flow {
	const flow = standardRegistry.flow('Balance check').description('Compare a balance handed in by the host with a threshold.');

	const start = flow.add('trigger.manual', {}, { id: 'start' });
	const check = flow.add(
		'logic.if',
		{ conditions: [{ left: '{{ vars.balance }}', operator: 'gt', right: 1000 }] },
		{ id: 'enough', label: 'Enough to pay?' }
	);
	const pay = flow.add(
		'data.set',
		{ fields: [{ name: 'message', value: 'Paying out of {{ vars.balance }} {{ vars.currency }}' }], keepInput: false },
		{ id: 'pay', label: 'Pay' }
	);
	const hold = flow.add(
		'data.set',
		{ fields: [{ name: 'message', value: 'Holding: only {{ vars.balance }} {{ vars.currency }}' }], keepInput: false },
		{ id: 'hold', label: 'Hold' }
	);

	start.to(check);
	check.on('true').to(pay);
	check.on('false').to(hold);
	return flow.build();
}
