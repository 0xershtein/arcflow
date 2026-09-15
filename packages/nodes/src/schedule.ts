import { defineNode, f } from '@arcflow/core';
import { Cron } from 'croner';
import { hasExpression, isRecord } from './util.js';

/** Next times a cron expression fires. Throws for invalid expressions or time zones. */
export function nextRuns(cron: string, timezone?: string, count = 3, from?: Date): Date[] {
	const job = new Cron(cron, { timezone, paused: true });
	try {
		return job.nextRuns(count, from);
	} finally {
		job.stop();
	}
}

export const scheduleTrigger = defineNode({
	kind: 'trigger.schedule',
	title: 'Schedule',
	description: 'Starts the flow on a cron schedule. A scheduler, such as @arcflow/server, starts runs at these times.',
	category: 'triggers',
	icon: 'clock',
	trigger: true,
	config: {
		cron: f.string({
			default: '0 9 * * 1-5',
			mono: true,
			label: 'Cron expression',
			description: 'minute hour day-of-month month day-of-week — "0 9 * * 1-5" is 09:00 on weekdays.'
		}),
		timezone: f.string({ default: 'UTC', label: 'Time zone', placeholder: 'Europe/Istanbul' })
	},
	check: (c) => {
		if (hasExpression(c.cron) || hasExpression(c.timezone)) return null;
		try {
			nextRuns(c.cron, c.timezone, 1);
			return null;
		} catch (error) {
			return `"${c.cron}" in ${c.timezone} is not a valid schedule${error instanceof Error ? ` (${error.message})` : ''}.`;
		}
	},
	summary: (c) => {
		try {
			const [next] = nextRuns(c.cron, c.timezone, 1);
			return next ? `${c.cron} · next ${next.toISOString().slice(0, 16).replace('T', ' ')} UTC` : c.cron;
		} catch {
			return c.cron;
		}
	},
	run: (ctx) => ({ output: { firedAt: new Date().toISOString(), ...(isRecord(ctx.input) ? ctx.input : {}) } })
});
