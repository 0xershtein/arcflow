import type { Flow } from '@arcsig-labs/core';
import { standardRegistry } from '@arcsig-labs/nodes';

/**
 * A short flow for the embedded demo: wide enough to show connections and ports,
 * small enough to stay readable in a page.
 */
export function createDemoFlow(): Flow {
	const flow = standardRegistry.flow('Is the site up?').description('Check a status endpoint by hand and report whether it answered.');

	const start = flow.add('trigger.manual', {}, { id: 'start' });
	const check = flow.add('http.request', { url: 'https://example.com/status' }, { id: 'status', label: 'Fetch status' });
	const report = flow.add(
		'code.javascript',
		{ code: ['const ok = input.status === 200;', 'return { ok, checkedAt: new Date().toISOString() };'].join('\n') },
		{ id: 'report', label: 'Is it up?' }
	);

	start.to(check).to(report);
	return flow.build();
}
