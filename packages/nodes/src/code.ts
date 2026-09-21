import { defineNode, f } from '@arcsig-labs/core';
import type { QuickJSWASMModule } from 'quickjs-emscripten-core';
import { isRecord } from './util.js';

let quickjs: Promise<QuickJSWASMModule> | undefined;

/**
 * Loads the release build of QuickJS once. The dynamic imports let bundlers keep the WebAssembly
 * out of the main chunk until a Code step actually runs.
 */
async function loadQuickJS() {
	const [core, variant] = await Promise.all([import('quickjs-emscripten-core'), import('@jitl/quickjs-wasmfile-release-sync')]);
	const module = await (quickjs ??= core.newQuickJSWASMModuleFromVariant(variant.default));
	return { module, shouldInterruptAfterDeadline: core.shouldInterruptAfterDeadline };
}

export interface SandboxOptions {
	/** Values exposed to the code as variables. Must be JSON-serializable. */
	globals?: Record<string, unknown>;
	/** CPU time limit. Default 1000 ms. */
	timeoutMs?: number;
	/** Heap limit. Default 32 MB. */
	memoryLimitBytes?: number;
	onLog?: (line: string) => void;
}

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

function errorMessage(error: unknown, timeoutMs: number) {
	const message = isRecord(error) ? `${error.name ?? 'Error'}: ${error.message ?? ''}` : String(error);
	if (/interrupted/i.test(message)) return `Code ran longer than ${timeoutMs} ms.`;
	if (/out of memory/i.test(message)) return 'Code used too much memory.';
	return message;
}

const stringify = (value: unknown) => (typeof value === 'string' ? value : JSON.stringify(value));

/**
 * Runs JavaScript in a fresh QuickJS (WebAssembly) sandbox with no network, file system, timers or host
 * objects. The code is a function body: `return` a JSON-serializable value. `console.log` is captured.
 */
export async function runSandboxed(code: string, options: SandboxOptions = {}): Promise<unknown> {
	const { timeoutMs = 1_000, memoryLimitBytes = 32 * 1024 * 1024, globals = {}, onLog } = options;
	const { module, shouldInterruptAfterDeadline } = await loadQuickJS();

	const runtime = module.newRuntime();
	runtime.setMemoryLimit(memoryLimitBytes);
	runtime.setMaxStackSize(1024 * 1024);
	const vm = runtime.newContext();

	try {
		const consoleObject = vm.newObject();
		for (const level of ['log', 'info', 'warn', 'error']) {
			const handle = vm.newFunction(level, (...args) => {
				onLog?.(args.map((arg) => stringify(vm.dump(arg))).join(' '));
			});
			vm.setProp(consoleObject, level, handle);
			handle.dispose();
		}
		vm.setProp(vm.global, 'console', consoleObject);
		consoleObject.dispose();

		const names = Object.keys(globals).filter((name) => IDENTIFIER.test(name));
		const source = [
			'"use strict";',
			`const __globals = JSON.parse(${JSON.stringify(JSON.stringify(globals))});`,
			`(function (${names.join(', ')}) {`,
			code,
			`})(${names.map((name) => `__globals[${JSON.stringify(name)}]`).join(', ')});`
		].join('\n');

		runtime.setInterruptHandler(shouldInterruptAfterDeadline(Date.now() + timeoutMs));
		const result = vm.evalCode(source, 'code.js');
		if (result.error) {
			const error = vm.dump(result.error);
			result.error.dispose();
			throw new Error(errorMessage(error, timeoutMs));
		}
		const value = vm.dump(result.value);
		result.value.dispose();
		return value;
	} finally {
		vm.dispose();
		runtime.dispose();
	}
}

export const codeStep = defineNode({
	kind: 'code.javascript',
	title: 'Code',
	description:
		'Runs JavaScript in a sandbox with no network or file access. Use input, inputs, vars, steps, $item and $index; the returned value becomes the output.',
	category: 'code',
	icon: 'code',
	outputs: [{ id: 'out' }, { id: 'error', label: 'Error' }],
	config: {
		code: f.text({
			mono: true,
			placeholder: 'return input.items.filter((item) => item.active);',
			description: 'A function body. Return a JSON value.'
		}),
		timeoutMs: f.number({ integer: true, min: 10, max: 30_000, default: 1_000, label: 'Time limit', unit: 'ms' })
	},
	summary: (c) =>
		String(c.code ?? '')
			.split('\n')
			.map((line) => line.trim())
			.find((line) => line && !line.startsWith('//'))
			?.slice(0, 60) ?? 'Code',
	run: async (ctx) => {
		const output = await runSandboxed(ctx.config.code, {
			timeoutMs: ctx.config.timeoutMs,
			globals: { input: ctx.input, inputs: ctx.inputs, vars: ctx.vars, steps: ctx.steps, $item: ctx.item, $index: ctx.index },
			onLog: (line) => ctx.log(line)
		});
		return { port: 'out', output };
	}
});
