export const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

const BLOCKED = new Set(['__proto__', 'prototype', 'constructor']);

/** Sets `a.b.c` on an object, creating intermediate objects. */
export function setPath(target: Record<string, unknown>, path: string, value: unknown) {
	const keys = path
		.split('.')
		.map((key) => key.trim())
		.filter(Boolean);
	if (keys.length === 0 || keys.some((key) => BLOCKED.has(key))) throw new Error(`"${path}" is not a valid field name.`);
	let cursor = target;
	for (const key of keys.slice(0, -1)) {
		if (!isRecord(cursor[key])) cursor[key] = {};
		cursor = cursor[key] as Record<string, unknown>;
	}
	cursor[keys[keys.length - 1]] = value;
}

export const DURATION_MS = { seconds: 1_000, minutes: 60_000, hours: 3_600_000, days: 86_400_000 } as const;

export function sleep(ms: number, signal?: AbortSignal) {
	return new Promise<void>((resolve, reject) => {
		if (signal?.aborted) return reject(signal.reason ?? new Error('Aborted'));
		const timer = setTimeout(resolve, ms);
		signal?.addEventListener(
			'abort',
			() => {
				clearTimeout(timer);
				reject(signal.reason ?? new Error('Aborted'));
			},
			{ once: true }
		);
	});
}

export const isEmpty = (value: unknown) =>
	value === undefined ||
	value === null ||
	value === '' ||
	(Array.isArray(value) && value.length === 0) ||
	(isRecord(value) && Object.keys(value).length === 0);

const numeric = (value: unknown) => (typeof value === 'number' || (typeof value === 'string' && value.trim() !== '') ? Number(value) : NaN);

/** Equality that treats `"5"` and `5` as equal and compares objects by content. */
export function looseEquals(a: unknown, b: unknown): boolean {
	if (a === b) return true;
	const x = numeric(a);
	const y = numeric(b);
	if (Number.isFinite(x) && Number.isFinite(y) && (typeof a === 'number' || typeof b === 'number')) return x === y;
	if ((a && typeof a === 'object') || (b && typeof b === 'object')) return JSON.stringify(a) === JSON.stringify(b);
	return String(a) === String(b);
}

/** Orders numbers numerically and anything else as text. */
export function compare(a: unknown, b: unknown): number {
	const x = numeric(a);
	const y = numeric(b);
	if (Number.isFinite(x) && Number.isFinite(y)) return x - y;
	return String(a).localeCompare(String(b));
}

export const hasExpression = (value: unknown) => typeof value === 'string' && value.includes('{{');
