import { describe, expect, it } from 'vitest';
import type { Issue } from '@arcflow/core';
import { afterEach, vi } from 'vitest';
import { defineNode, f } from '@arcflow/core';
import { defaultUi, isCompactToolbar, resolveLabels, resolveToolbar, resolveUi } from '../src/options.js';
import { formatDuration, runHeader, statusText, statusTitle, stepSummary, summarize, withLocalTimes } from '../src/summary.js';

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

describe('run log header counts', () => {
	it('says what a finished simulation really did', () => {
		expect(runHeader('test', labels, 0).note).toBe('Simulated — nothing was sent');
		expect(runHeader('test', labels, 1).note).toBe('Simulated — 1 step had no test mode and really ran');
		expect(runHeader('test-server', labels, 3).note).toBe('Simulated — 3 steps had no test mode and really ran');
	});

	it('keeps the general warning while a run is going or when it cannot count', () => {
		expect(runHeader('test', labels).note).toBe(labels.simulated);
		expect(runHeader('test-server', labels, null).note).toBe(labels.simulatedOnServer);
		expect(runHeader('live', labels, 0)).toEqual({ title: 'Run', note: 'Ran on the server', live: true });
	});
});

describe('toolbar parts', () => {
	const parts = Object.keys(defaultUi.toolbar || {});

	it('keeps every part for true, drops the toolbar for false', () => {
		expect(resolveToolbar(true)).toEqual(defaultUi.toolbar);
		expect(resolveToolbar(undefined)).toEqual(defaultUi.toolbar);
		expect(resolveToolbar(false)).toBe(false);
	});

	it('keeps the parts a host does not mention', () => {
		const toolbar = resolveToolbar({ name: false, testRun: false });
		expect(toolbar).toMatchObject({ name: false, testRun: false, undo: true, note: true, status: true });
		expect(Object.keys(toolbar || {})).toEqual(parts);
	});

	it('shrinks to a strip once only the badge and the icons are left', () => {
		// A host header plus a full row costs twice the height; this is the rule that avoids it.
		const onlyIcons = { name: false, json: false, importExport: false, flows: false, executions: false, run: false, testRun: false };
		expect(isCompactToolbar(resolveToolbar(onlyIcons))).toBe(true);
		expect(isCompactToolbar(resolveToolbar({ ...onlyIcons, status: false, undo: false, note: false }))).toBe(true);

		// Anything that carries a labelled button keeps the full row.
		expect(isCompactToolbar(resolveToolbar({ ...onlyIcons, json: true }))).toBe(false);
		expect(isCompactToolbar(resolveToolbar({ ...onlyIcons, testRun: true }))).toBe(false);
		expect(isCompactToolbar(resolveToolbar({ name: false }))).toBe(false);
		expect(isCompactToolbar(resolveToolbar(true))).toBe(false);
		expect(isCompactToolbar(resolveToolbar(false))).toBe(false);
	});

	it('is part of the resolved ui, and leaves the other options alone', () => {
		const ui = resolveUi({ toolbar: { name: false }, palette: false });
		expect(ui.toolbar).toMatchObject({ name: false, undo: true });
		expect(ui.palette).toBe(false);
		expect(ui.inspector).toBe(true);
		expect(resolveUi({ toolbar: false }).toolbar).toBe(false);
		expect(resolveUi().attribution).toBe('bottom-right');
	});
});

describe('step summaries', () => {
	const schedule = defineNode({
		kind: 'test.schedule',
		title: 'Schedule',
		description: 'Runs on a schedule.',
		config: { cron: f.string({ default: '0 9 * * 1-5' }) },
		summary: (config) => config.cron,
		run: () => ({})
	});

	it('prefers the wording the host gave for that kind', () => {
		expect(stepSummary(schedule, { cron: '0 9 * * 1-5' })).toBe('0 9 * * 1-5');
		expect(stepSummary(schedule, { cron: '0 9 * * 1-5' }, { 'test.schedule': () => 'Every weekday at 09:00' })).toBe('Every weekday at 09:00');
		// Another kind's override is not this step's business.
		expect(stepSummary(schedule, { cron: '@daily' }, { 'other.kind': () => 'nope' })).toBe('@daily');
	});

	it('hands the step over, for wording that depends on which one it is', () => {
		const node = { id: 'nightly', kind: 'test.schedule', label: 'Nightly digest', config: { cron: '@daily' } };
		const seen: unknown[] = [];
		const text = stepSummary(
			schedule,
			node.config,
			{
				'test.schedule': (config, def, given) => {
					seen.push([config, def.title, given]);
					return `${given.label ?? def.title} — ${config.cron}`;
				}
			},
			node
		);
		expect(text).toBe('Nightly digest — @daily');
		expect(seen).toEqual([[node.config, 'Schedule', node]]);
	});

	it('falls back rather than breaking the canvas', () => {
		const boom = () => {
			throw new Error('half-written config');
		};
		expect(stepSummary(schedule, { cron: '@daily' }, { 'test.schedule': boom })).toBe('@daily');
		expect(stepSummary({ ...schedule, summary: boom }, {}, { 'test.schedule': boom })).toBe('Runs on a schedule.');
		// An override that returns nothing usable is no override at all.
		expect(stepSummary(schedule, { cron: '@daily' }, { 'test.schedule': () => '' })).toBe('@daily');
	});
});

describe('a summary that throws', () => {
	const broken = defineNode({
		kind: 'test.broken',
		title: 'Broken',
		description: 'Its own summary is fine.',
		config: {},
		summary: () => 'the definition speaks',
		run: () => ({})
	});
	const boom = () => {
		throw new Error('half-written config');
	};

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('is reported once per kind while developing, and never twice', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		expect(stepSummary(broken, {}, { 'test.broken': boom })).toBe('the definition speaks');
		expect(stepSummary(broken, {}, { 'test.broken': boom })).toBe('the definition speaks');
		expect(stepSummary(broken, {}, { 'test.broken': boom })).toBe('the definition speaks');
		expect(warn).toHaveBeenCalledTimes(1);
		expect(String(warn.mock.calls[0][0])).toContain('test.broken');
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
