import { createRegistry, type Flow } from '@arcflow/core';
import { standardSteps } from './pack.js';

export const standardRegistry = createRegistry([standardSteps]);

/**
 * Fetches to-dos from a public API, keeps the open ones in a Code step, and posts a digest when there are any.
 */
export function createTodoDigestFlow(registry = standardRegistry): Flow {
	const flow = registry.flow('Open to-do digest').description('Fetch to-dos, keep the open ones, and post a digest if there are any.');

	const start = flow.add('trigger.manual', {}, { id: 'start' });
	const fetchTodos = flow.add('http.request', { url: 'https://jsonplaceholder.typicode.com/todos?userId=1' }, { id: 'fetch', label: 'Fetch to-dos' });
	const open = flow.add(
		'code.javascript',
		{
			code: [
				'const open = input.body.filter((todo) => !todo.completed);',
				'console.log(`${open.length} of ${input.body.length} open`);',
				'return { count: open.length, titles: open.slice(0, 5).map((todo) => todo.title) };'
			].join('\n')
		},
		{ id: 'open', label: 'Keep open ones' }
	);
	const anyOpen = flow.add('logic.if', { conditions: [{ left: '{{ input.count }}', operator: 'gt', right: 0 }] }, { id: 'any', label: 'Anything open?' });
	const post = flow.add(
		'http.request',
		{
			method: 'POST',
			url: 'https://httpbin.org/post',
			body: { text: '{{ steps.open.output.count }} open: {{ steps.open.output.titles | join: ", " }}' }
		},
		{ id: 'post', label: 'Post digest' }
	);
	const quiet = flow.add('data.set', { fields: [{ name: 'message', value: 'Nothing open' }], keepInput: false }, { id: 'quiet', label: 'Nothing to send' });

	start.to(fetchTodos).to(open).to(anyOpen);
	anyOpen.on('true').to(post);
	anyOpen.on('false').to(quiet);

	return flow.build();
}
