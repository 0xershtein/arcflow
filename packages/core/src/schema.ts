import type { Issue, IssueCode } from './issues.js';

/**
 * A small schema DSL for step config. One definition gives you the TypeScript type,
 * runtime parsing with path-addressed issues, JSON Schema for LLM tooling, and form hints for editors.
 *
 *   const config = {
 *     threshold: f.number({ integer: true, min: 1 }),
 *     signers: f.list(f.string(), { minItems: 1 }),
 *     token: f.credential('api-token'),
 *     body: f.json({ optional: true })
 *   };
 */

export interface Condition {
	field: string;
	equals: readonly unknown[];
}

interface FieldBase<T, I> {
	readonly label?: string;
	readonly description?: string;
	readonly optional?: boolean;
	readonly default?: unknown;
	/** Editors hide the field (and parsing stops requiring it) unless another field matches. */
	readonly when?: Condition;
	/** Type-level carrier for inference. Not present at runtime. */
	readonly __types: { output: T; input: I };
}

export interface StringField<T = string, I = T> extends FieldBase<T, I> {
	readonly kind: 'string';
	readonly multiline?: boolean;
	readonly placeholder?: string;
	readonly pattern?: string;
	readonly minLength?: number;
	readonly maxLength?: number;
	/** Render in a monospace face (addresses, ids). */
	readonly mono?: boolean;
}

export interface NumberField<T = number, I = T> extends FieldBase<T, I> {
	readonly kind: 'number';
	readonly min?: number;
	readonly max?: number;
	readonly integer?: boolean;
	readonly step?: number;
	readonly unit?: string;
	readonly placeholder?: string;
}

export interface BooleanField<T = boolean, I = T> extends FieldBase<T, I> {
	readonly kind: 'boolean';
}

export interface EnumField<T = string, I = T> extends FieldBase<T, I> {
	readonly kind: 'enum';
	readonly values: readonly string[];
	readonly labels?: Readonly<Record<string, string>>;
}

export interface ListField<T = unknown[], I = T> extends FieldBase<T, I> {
	readonly kind: 'list';
	readonly item: Field | Shape;
	readonly minItems?: number;
	readonly maxItems?: number;
}

/** Any JSON value: request bodies, headers, item lists. */
export interface JsonField<T = unknown, I = T> extends FieldBase<T, I> {
	readonly kind: 'json';
	readonly placeholder?: string;
}

/** A reference to a stored secret. The flow keeps only the id; the value is resolved at run time. */
export interface CredentialField<T = string, I = T> extends FieldBase<T, I> {
	readonly kind: 'credential';
	/** Credential type, e.g. "http-bearer" or "smtp". */
	readonly type: string;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Field =
	| StringField<any, any>
	| NumberField<any, any>
	| BooleanField<any, any>
	| EnumField<any, any>
	| ListField<any, any>
	| JsonField<any, any>
	| CredentialField<any, any>;
/* eslint-enable @typescript-eslint/no-explicit-any */

export type Shape = { readonly [key: string]: Field };

type Prettify<T> = { [K in keyof T]: T[K] };

/** A `{{ expression }}` string, accepted anywhere a config value is expected. */
export type Expression = `{{${string}}}`;

export type Infer<F> = F extends { readonly __types: { output: infer T } } ? T : never;
export type InferInput<F> = F extends { readonly __types: { input: infer I } } ? I : never;

/** Config type a step receives at run time (defaults applied). */
export type InferShape<S extends Shape> = Prettify<{ -readonly [K in keyof S]: Infer<S[K]> }>;

type InputValue<T> = string extends T ? T : T | Expression;

/** Config type accepted when building a flow (fields with defaults are optional). */
export type ShapeInput<S extends Shape> = Prettify<
	{ -readonly [K in keyof S as undefined extends InferInput<S[K]> ? never : K]: InputValue<InferInput<S[K]>> } & {
		-readonly [K in keyof S as undefined extends InferInput<S[K]> ? K : never]?: InputValue<
			Exclude<InferInput<S[K]>, undefined>
		>;
	}
>;

type Meta = { label?: string; description?: string; when?: Condition };
type Presence<T> = { optional?: boolean; default?: T };
// Fields shown only `when` another field matches may be absent, so they are optional like `optional: true`.
type Output<O, T> = O extends { default: {} } ? T : O extends { optional: true } | { when: {} } ? T | undefined : T;
type Input<O, T> = O extends { default: {} } ? T | undefined : O extends { optional: true } | { when: {} } ? T | undefined : T;

export type StringOptions = Meta &
	Presence<string> & { placeholder?: string; pattern?: string; minLength?: number; maxLength?: number; mono?: boolean };
export type NumberOptions = Meta &
	Presence<number> & { min?: number; max?: number; integer?: boolean; step?: number; unit?: string; placeholder?: string };
export type BooleanOptions = Meta & Presence<boolean>;
export type EnumOptions<V extends string> = Meta & Presence<V> & { labels?: Partial<Record<V, string>> };
export type ListOptions<T> = Meta & Presence<T[]> & { minItems?: number; maxItems?: number };
export type JsonOptions = Meta & Presence<unknown> & { placeholder?: string };
export type CredentialOptions = Meta & { optional?: boolean };

type ItemOutput<I> = I extends Field ? Infer<I> : I extends Shape ? InferShape<I> : never;
type ItemInput<I> = I extends Field ? InferInput<I> : I extends Shape ? ShapeInput<I> : never;

const make = <F>(kind: Field['kind'], options: object | undefined, extra: object = {}) =>
	({ kind, ...extra, ...options }) as unknown as F;

export const f = {
	/** Single-line text. */
	string: <const O extends StringOptions = {}>(options?: O) =>
		make<StringField<Output<O, string>, Input<O, string>>>('string', options),
	/** Multi-line text. */
	text: <const O extends StringOptions = {}>(options?: O) =>
		make<StringField<Output<O, string>, Input<O, string>>>('string', options, { multiline: true }),
	number: <const O extends NumberOptions = {}>(options?: O) =>
		make<NumberField<Output<O, number>, Input<O, number>>>('number', options),
	boolean: <const O extends BooleanOptions = {}>(options?: O) =>
		make<BooleanField<Output<O, boolean>, Input<O, boolean>>>('boolean', options),
	enum: <const V extends readonly [string, ...string[]], const O extends EnumOptions<V[number]> = {}>(values: V, options?: O) =>
		make<EnumField<Output<O, V[number]>, Input<O, V[number]>>>('enum', options, { values }),
	/** A list of values (`f.list(f.string())`) or of objects (`f.list({ to: f.string(), amount: f.number() })`). */
	list: <const I extends Field | Shape, const O extends ListOptions<ItemOutput<I>> = {}>(item: I, options?: O) =>
		make<ListField<Output<O, ItemOutput<I>[]>, Input<O, ItemInput<I>[]>>>('list', options, { item }),
	/** Any JSON value. */
	json: <const O extends JsonOptions = {}>(options?: O) => make<JsonField<Output<O, unknown>, Input<O, unknown>>>('json', options),
	/** A stored secret of the given type, resolved at run time into `ctx.secrets[field]`. */
	credential: <const O extends CredentialOptions = {}>(type: string, options?: O) =>
		make<CredentialField<Output<O, string>, Input<O, string>>>('credential', options, { type })
};

export const isField = (value: Field | Shape): value is Field => typeof (value as { kind?: unknown }).kind === 'string';

export const isExpression = (value: unknown): value is string => typeof value === 'string' && /\{\{[\s\S]*?\}\}/.test(value);

/** `expiresHours` → `Expires hours` */
export function humanize(key: string) {
	const words = key
		.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
		.replace(/[_-]+/g, ' ')
		.trim()
		.toLowerCase();
	return words.charAt(0).toUpperCase() + words.slice(1);
}

export const fieldLabel = (key: string, field: Field) => field.label ?? humanize(key);

export function isFieldVisible(field: Field, config: Record<string, unknown>, shape?: Shape) {
	if (!field.when) return true;
	const current = config[field.when.field] ?? shape?.[field.when.field]?.default;
	return field.when.equals.includes(current);
}

/** Fills in defaults without validating — handy for a freshly added step. */
export function defaultsOf(shape: Shape): Record<string, unknown> {
	const value: Record<string, unknown> = {};
	for (const [key, field] of Object.entries(shape)) {
		if (field.default !== undefined) value[key] = structuredClone(field.default);
	}
	return value;
}

export interface ParseOptions {
	/** Accept `{{ expression }}` strings for any field; they are checked again after resolution. */
	allowExpressions?: boolean;
}

export interface ParseOutcome<T> {
	value: T;
	issues: Issue[];
}

const joinPath = (base: string, key: string | number) =>
	typeof key === 'number' ? `${base}[${key}]` : base ? `${base}.${key}` : key;

const lastSegment = (path: string) => path.replace(/\[\d+\]$/, '').split('.').pop() ?? path;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

export function parseShape(
	shape: Shape,
	input: unknown,
	path = '',
	options: ParseOptions = {}
): ParseOutcome<Record<string, unknown>> {
	if (input !== undefined && input !== null && !isPlainObject(input)) {
		return { value: {}, issues: [{ level: 'error', code: 'invalid_type', path, message: 'Expected an object.' }] };
	}
	const source = (input ?? {}) as Record<string, unknown>;
	const value: Record<string, unknown> = {};
	const issues: Issue[] = [];

	for (const [key, field] of Object.entries(shape)) {
		const hidden = !isFieldVisible(field, source, shape);
		const result = parseField(field, source[key], joinPath(path, key), options, hidden);
		if (result.value !== undefined) value[key] = result.value;
		issues.push(...result.issues);
	}
	for (const key of Object.keys(source)) {
		if (!(key in shape)) {
			issues.push({ level: 'warning', code: 'unknown_key', path: joinPath(path, key), message: `Unknown setting "${key}" is ignored.` });
		}
	}
	return { value, issues };
}

export function parseField(
	field: Field,
	raw: unknown,
	path: string,
	options: ParseOptions = {},
	hidden = false
): ParseOutcome<unknown> {
	const name = field.label ?? humanize(lastSegment(path));
	const fail = (code: IssueCode, message: string): ParseOutcome<unknown> => ({
		value: undefined,
		issues: [{ level: 'error', code, path, message }]
	});

	if (raw === undefined || raw === null || raw === '') {
		if (field.default !== undefined) return { value: structuredClone(field.default), issues: [] };
		if (field.optional || hidden) return { value: undefined, issues: [] };
		return fail('required', `${name} is required.`);
	}

	if (options.allowExpressions && isExpression(raw)) return { value: raw, issues: [] };

	switch (field.kind) {
		case 'string': {
			const value = typeof raw === 'number' || typeof raw === 'boolean' ? String(raw) : raw;
			if (typeof value !== 'string') return fail('invalid_type', `${name} must be text.`);
			if (field.minLength !== undefined && value.length < field.minLength)
				return fail('too_small', `${name} must be at least ${field.minLength} characters.`);
			if (field.maxLength !== undefined && value.length > field.maxLength)
				return fail('too_big', `${name} must be at most ${field.maxLength} characters.`);
			if (field.pattern && !new RegExp(field.pattern).test(value))
				return fail('invalid_pattern', `${name} does not match the expected format.`);
			return { value, issues: [] };
		}
		case 'number': {
			const value = typeof raw === 'string' && /^\s*-?\d+(\.\d+)?\s*$/.test(raw) ? Number(raw) : raw;
			if (typeof value !== 'number' || !Number.isFinite(value)) return fail('invalid_type', `${name} must be a number.`);
			if (field.integer && !Number.isInteger(value)) return fail('invalid_type', `${name} must be a whole number.`);
			if (field.min !== undefined && value < field.min) return fail('too_small', `${name} must be at least ${field.min}.`);
			if (field.max !== undefined && value > field.max) return fail('too_big', `${name} must be at most ${field.max}.`);
			return { value, issues: [] };
		}
		case 'boolean': {
			const value = raw === 'true' ? true : raw === 'false' ? false : raw;
			if (typeof value !== 'boolean') return fail('invalid_type', `${name} must be true or false.`);
			return { value, issues: [] };
		}
		case 'enum': {
			if (typeof raw !== 'string' || !field.values.includes(raw)) {
				return fail('invalid_enum', `${name} must be one of ${field.values.map((v) => `"${v}"`).join(', ')}.`);
			}
			return { value: raw, issues: [] };
		}
		case 'list': {
			if (!Array.isArray(raw)) return fail('invalid_type', `${name} must be a list.`);
			if (field.minItems !== undefined && raw.length < field.minItems)
				return fail('too_small', `${name} needs at least ${field.minItems} ${field.minItems === 1 ? 'item' : 'items'}.`);
			if (field.maxItems !== undefined && raw.length > field.maxItems)
				return fail('too_big', `${name} allows at most ${field.maxItems} items.`);
			const issues: Issue[] = [];
			const value = raw.map((item, index) => {
				const itemPath = joinPath(path, index);
				const result = isField(field.item)
					? parseField(field.item, item, itemPath, options)
					: parseShape(field.item, item, itemPath, options);
				issues.push(...result.issues);
				return result.value;
			});
			return { value, issues };
		}
		case 'json':
			return { value: raw, issues: [] };
		case 'credential': {
			if (typeof raw !== 'string') return fail('invalid_type', `${name} must be a credential id.`);
			return { value: raw, issues: [] };
		}
	}
}
