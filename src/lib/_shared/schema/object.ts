import { fail, hasErrorSeverity, ok, type InternalResult } from "./error.ts";
import { ConfigurableSchema, Schema, type CommonOptions, type Options } from "./schema.ts";
import type { Issue, ParseContext } from "./types.ts";
import { typeOf } from "./types.ts";

export type Shape = Record<string, Schema<any>>;

export type InferShape<S extends Shape> = {
  [K in keyof S]: S[K]["_output"];
};

type PartialField<F extends Schema<any>> =
  F extends ConfigurableSchema<infer U, any> ? ConfigurableSchema<U, { readonly required: false }> : F;

type PartialShape<S extends Shape> = { [K in keyof S]: PartialField<S[K]> };

type DeepPartialField<F extends Schema<any>> =
  F extends ObjectSchema<infer S2, any> ? ObjectSchema<DeepPartialShape<S2>> : PartialField<F>;

type DeepPartialShape<S extends Shape> = { [K in keyof S]: DeepPartialField<S[K]> };

type DerivedOptions<O> = Omit<O, "refine" | "default"> & CommonOptions<any>;

export class ObjectSchema<S extends Shape, const O extends CommonOptions<any> = {}> extends ConfigurableSchema<
  InferShape<S>,
  O
> {
  readonly typeName = "object";
  readonly shape: S;
  declare readonly options: Options<O, CommonOptions<InferShape<S>>>;

  constructor(shape: S, options: O & CommonOptions<InferShape<S>>) {
    super(options);
    this.shape = shape;
  }

  protected _parseValue(value: unknown, ctx: ParseContext): InternalResult<InferShape<S>> {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return fail([
        {
          path: ctx.path,
          type: "error",
          code: "invalid_type",
          key: "object.invalid_type",
          params: { expected: "object", received: typeOf(value) },
        },
      ]);
    }

    const record = value as Record<string, unknown>;
    const output: Record<string, unknown> = {};
    const issues: Issue[] = [];

    for (const key of Object.keys(this.shape)) {
      const fieldSchema = this.shape[key]!;
      // プロトタイプ（constructor など）を項目の値として読まない。
      const has = Object.hasOwn(record, key);
      const result = fieldSchema._parse(has ? record[key] : undefined, { ...ctx, path: [...ctx.path, key] });
      if (result.success) {
        if (result.data !== undefined || has) output[key] = result.data;
        if (result.issues?.length) issues.push(...result.issues);
      } else {
        issues.push(...result.issues);
      }
    }

    for (const key of Object.keys(record)) {
      if (!Object.hasOwn(this.shape, key)) {
        issues.push({
          path: ctx.path,
          type: "warning",
          code: "unknown_key",
          key: "object.unknown_key",
          params: { key },
        });
      }
    }

    if (hasErrorSeverity(issues)) return fail(issues);
    return ok(output as InferShape<S>, issues);
  }

  private derive<S2 extends Shape>(shape: S2): ObjectSchema<S2, DerivedOptions<O>> {
    const { refine: _refine, default: _default, ...rest } = this.options;
    return new ObjectSchema(shape, rest as DerivedOptions<O>);
  }

  extend<S2 extends Shape>(extension: S2): ObjectSchema<Omit<S, keyof S2> & S2, DerivedOptions<O>> {
    return this.derive({ ...this.shape, ...extension } as Omit<S, keyof S2> & S2);
  }

  pick<K extends keyof S>(keys: K[]): ObjectSchema<Pick<S, K>, DerivedOptions<O>> {
    const picked = {} as Pick<S, K>;
    for (const key of keys) picked[key] = this.shape[key];
    return this.derive(picked);
  }

  omit<K extends keyof S>(keys: K[]): ObjectSchema<Omit<S, K>, DerivedOptions<O>> {
    const remaining = { ...this.shape };
    for (const key of keys) delete remaining[key];
    return this.derive(remaining as Omit<S, K>);
  }

  partial(): ObjectSchema<PartialShape<S>, DerivedOptions<O>> {
    const shape = {} as PartialShape<S>;
    for (const key of Object.keys(this.shape) as (keyof S)[]) {
      const field = this.shape[key];
      shape[key] = (field instanceof ConfigurableSchema ? field.optional() : field) as PartialShape<S>[keyof S];
    }
    return this.derive(shape);
  }

  deepPartial(): ObjectSchema<DeepPartialShape<S>, DerivedOptions<O>> {
    const shape = {} as DeepPartialShape<S>;
    for (const key of Object.keys(this.shape) as (keyof S)[]) {
      const field = this.shape[key];
      const next = field instanceof ObjectSchema ? field.deepPartial() : field;
      shape[key] = (next instanceof ConfigurableSchema ? next.optional() : next) as DeepPartialShape<S>[keyof S];
    }
    return this.derive(shape);
  }
}

export function $object<S extends Shape, const O extends CommonOptions<any> = {}>(
  shape: S,
  options: O & CommonOptions<InferShape<S>> = {} as O,
): ObjectSchema<S, O> {
  return new ObjectSchema(shape, options);
}
