import { createEditor } from '@arcflow/editor';
import { createPayrollFlow, paymentsRegistry } from '@arcflow/payments';

const output = document.querySelector<HTMLPreElement>('#output')!;
const show = (label: string, value: unknown) => (output.textContent = `${label}\n\n${JSON.stringify(value, null, 2)}`);

const editor = createEditor('#editor', {
	steps: paymentsRegistry,
	flow: createPayrollFlow(),
	theme: { mode: 'light', colors: { accent: '#0891b2', accentSoft: 'rgba(8, 145, 178, 0.14)' }, radius: 6 },
	ui: { importExport: false },
	onChange: (flow) => show('onChange', flow),
	onValidate: (issues) => console.log('[arcflow] issues', issues),
	onSelect: (id) => console.log('[arcflow] selected', id),
	onRun: (event) => event.type === 'run:end' && console.log('[arcflow] run', event.status)
});

document.querySelector('#dark')!.addEventListener('click', () => editor.setOptions({ theme: { mode: 'dark', radius: 6 } }));
document.querySelector('#light')!.addEventListener('click', () => editor.setOptions({ theme: { mode: 'light', radius: 6 } }));
document.querySelector('#run')!.addEventListener('click', () => editor.run());
document.querySelector('#load')!.addEventListener('click', async () => {
	const result = await editor.setFlow({
		version: 1,
		name: 'Minimal',
		nodes: [
			{ id: 'start', kind: 'trigger.manual', config: {} },
			{ id: 'say', kind: 'action.notify', config: { message: 'Hello' } }
		],
		edges: [{ id: 'e', from: 'start', port: 'out', to: 'say' }]
	});
	show('setFlow result', result);
});

// Handy for poking at it from the console or a test runner.
Object.assign(window, { editor });
