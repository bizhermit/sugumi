import { fail, hasErrorSeverity, ok, type InternalResult } from "./error.ts";
import { ConfigurableSchema, Schema, type CommonOptions, type RequiredOption } from "./schema.ts";
import type { Issue, ParseContext } from "./types.ts";
import { typeOf } from "./types.ts";

export type Shape = Record<string, Schema<any>>;

export type InferShape<S extends Shape> = {
  [K in keyof S]: S[K]["_output"];
};

type PartialField<F extends Schema<any>> =
  F extends ConfigurableSchema<infer U, any> ? ConfigurableSchema<U, false> : F;

type PartialShape<S extends Shape> = { [K in keyof S]: PartialField<S[K]> };

type DeepPartialField<F extends Schema<any>> =
  F extends ObjectSchema<infer S2, any> ? ObjectSchema<DeepPartialShape<S2>> : PartialField<F>;

type DeepPartialShape<S extends Shape> = { [K in keyof S]: DeepPartialField<S[K]> };

export class ObjectSchema<S extends Shape, const R extends RequiredOption = false> extends ConfigurableSchema<
  InferShape<S>,
  R
> {
  readonly typeName = "object";
  readonly shape: S;

  constructor(shape: S, options: CommonOptions<InferShape<S>, R> = {}) {
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
      const result = fieldSchema._parse(record[key], { path: [...ctx.path, key] });
      if (result.success) {
        if (result.data !== undefined || key in record) output[key] = result.data;
        if (result.issues?.length) issues.push(...result.issues);
      } else {
        issues.push(...result.issues);
      }
    }

    for (const key of Object.keys(record)) {
      if (!Object.hasOwn(this.shape, key)) {
        issues.push({
          path: [...ctx.path, key],
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

  private derive<S2 extends Shape>(shape: S2): ObjectSchema<S2, R> {
    const { refine: _refine, default: _default, ...rest } = this.options;
    return new ObjectSchema(shape, rest as CommonOptions<InferShape<S2>, R>);
  }

  extend<S2 extends Shape>(extension: S2): ObjectSchema<Omit<S, keyof S2> & S2, R> {
    return this.derive({ ...this.shape, ...extension } as Omit<S, keyof S2> & S2);
  }

  pick<K extends keyof S>(keys: K[]): ObjectSchema<Pick<S, K>, R> {
    const picked = {} as Pick<S, K>;
    for (const key of keys) picked[key] = this.shape[key];
    return this.derive(picked);
  }

  omit<K extends keyof S>(keys: K[]): ObjectSchema<Omit<S, K>, R> {
    const remaining = { ...this.shape };
    for (const key of keys) delete remaining[key];
    return this.derive(remaining as Omit<S, K>);
  }

  partial(): ObjectSchema<PartialShape<S>, R> {
    const shape = {} as PartialShape<S>;
    for (const key of Object.keys(this.shape) as (keyof S)[]) {
      const field = this.shape[key];
      shape[key] = (field instanceof ConfigurableSchema ? field.optional() : field) as PartialShape<S>[keyof S];
    }
    return this.derive(shape);
  }

  deepPartial(): ObjectSchema<DeepPartialShape<S>, R> {
    const shape = {} as DeepPartialShape<S>;
    for (const key of Object.keys(this.shape) as (keyof S)[]) {
      const field = this.shape[key];
      const next = field instanceof ObjectSchema ? field.deepPartial() : field;
      shape[key] = (next instanceof ConfigurableSchema ? next.optional() : next) as DeepPartialShape<S>[keyof S];
    }
    return this.derive(shape);
  }
}

export function object<S extends Shape, const R extends RequiredOption = false>(
  shape: S,
  options: CommonOptions<InferShape<S>, R> = {},
): ObjectSchema<S, R> {
  return new ObjectSchema(shape, options);
}
