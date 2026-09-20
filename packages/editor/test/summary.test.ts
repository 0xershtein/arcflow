import { describe, expect, it } from 'vitest';
import type { Issue } from '@arcflow/core';
import { resolveLabels } from '../src/options.js';
import { formatDuration, runHeader, statusText, statusTitle, summarize, withLocalTimes } from '../src/summary.js';

const labels = resolveLabels();
const error = (message: string): Issue => ({ level: 'error', code: 'required', path: 'nodes[0].config.to', message });
const warning = (message: string): Issue => ({ level: 'warning', code: 'disconnected', path: 'nodes[1]', message });

describe('what the editor says about a flow', () => {
	it('counts errors and warnings once, for the badge and the panel alike', () => {
		const summary = summarize([error('To is required.'), error('Url is required.'), warning('Not connected.')], 3);
		expect(summary).toEqual({ errors: 2, notes: 1, status: 'errors' });
		expect(statusText(summary, labels)).toBe('2 problems');
		expect(statusTitle(summary, labels)).toBe('Needs attention');
	});

	it('never says "Ready" while there are warnings', () => {
		const summary = summarize([warning('Not connected.'), warning('Never runs.')], 2);
		expect(summary.status).toBe('notes');
		expect(statusText(summary, labels)).toBe('2 notes');
		// The panel and the badge agree: neither claims the flow is ready.
		expect(statusTitle(summary, labels)).toBe('2 notes');
		expect(statusText(summarize([warning('Not connected.')], 2), labels)).toBe('1 note');
	});

	it('says Ready only when there is nothing to report', () => {
		const summary = summarize([], 2);
		expect(summary.status).toBe('ready');
		expect(statusText(summary, labels)).toBe('Ready');
		expect(statusTitle(summary, labels)).toBe('Looks good');
	});

	it('guides an empty flow instead of counting its missing trigger as a problem', () => {
		const summary = summarize([error('Add a step that starts the flow.')], 0);
		expect(summary.status).toBe('empty');
		expect(statusText(summary, labels)).toBe('Start with a trigger');
		expect(statusTitle(summary, labels)).toBe('Start with a trigger');
	});
});

describe('run log header', () => {
	it('tells a simulation from a run that really happened', () => {
		expect(runHeader('test', labels)).toEqual({ title: 'Test run', note: labels.simulated, live: false });
		expect(runHeader('test-server', labels)).toEqual({ title: 'Test run', note: labels.simulatedOnServer, live: false });
		expect(runHeader('live', labels)).toEqual({ title: 'Run', note: 'Ran on the server', live: true });
	});

	it('does not claim nothing was sent, since steps without a test mode still run', () => {
		expect(labels.simulated).toContain('still run');
		expect(runHeader('live', labels).note).not.toMatch(/simulat/i);
	});
});

describe('times and durations', () => {
	it('keeps a duration short and readable', () => {
		expect(formatDuration(0)).toBe('0ms');
		expect(formatDuration(420)).toBe('420ms');
		expect(formatDuration(1240)).toBe('1.2s');
		expect(formatDuration(59_400)).toBe('59s');
		expect(formatDuration(60_300)).toBe('1m 0s');
		expect(formatDuration(63_000)).toBe('1m 3s');
		expect(formatDuration(3 * 3600_000 + 300_000)).toBe('3h 5m');
		expect(formatDuration(-10)).toBe('0ms');
	});

	it('rewrites machine timestamps inside a message into local time', () => {
		const at = (date: Date) => `<${date.toISOString().slice(0, 10)}>`;
		expect(withLocalTimes('Waiting until 2026-09-20T09:31:01.551Z', at)).toBe('Waiting until <2026-09-20>');
		expect(withLocalTimes('Until 2026-10-01T09:00:00Z, then send', at)).toBe('Until <2026-10-01>, then send');
		expect(withLocalTimes('2 items', at)).toBe('2 items');
		expect(withLocalTimes('Waiting until 2026-09-20T09:31:01.551Z')).not.toContain('T09:31');
	});
});
