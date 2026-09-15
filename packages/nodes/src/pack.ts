import { definePack } from '@arcflow/core';
import { codeStep } from './code.js';
import { setFields } from './data.js';
import { callFlow } from './flows.js';
import { httpRequest, httpRespond } from './http.js';
import { ifStep, loopStep, mergeStep, switchStep, waitStep } from './logic.js';
import { scheduleTrigger } from './schedule.js';
import { manualTrigger, webhookTrigger } from './triggers.js';

export const standardSteps = definePack({
	id: 'standard',
	label: 'Standard steps',
	description: 'Triggers, HTTP, code, data and flow control.',
	categories: [
		{ id: 'triggers', label: 'Triggers' },
		{ id: 'http', label: 'HTTP' },
		{ id: 'code', label: 'Code' },
		{ id: 'data', label: 'Data' },
		{ id: 'flow', label: 'Flow' }
	],
	nodes: [
		manualTrigger,
		webhookTrigger,
		scheduleTrigger,
		httpRequest,
		httpRespond,
		codeStep,
		setFields,
		ifStep,
		switchStep,
		mergeStep,
		loopStep,
		waitStep,
		callFlow
	]
});
