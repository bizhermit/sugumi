import { fail, hasErrorSeverity, ok, type InternalResult } from "./error.ts";
import { ConfigurableSchema, Schema, type CommonOptions, type RequiredOption } from "./schema.ts";
import type { Issue, ParseContext } from "./types.ts";
import { typeOf } from "./types.ts";

type Elements = readonly [Schema<any>, ...Schema<any>[]];
type TupleOutput<T extends Elements> = { [K in keyof T]: T[K]["_output"] };

export class TupleSchema<T extends Elements, const R extends RequiredOption = false> extends ConfigurableSchema<
  TupleOutput<T>,
  R
> {
  readonly typeName = "tuple";
  readonly elements: T;

  constructor(elements: T, options: CommonOptions<TupleOutput<T>, R> = {}) {
    super(options);
    this.elements = elements;
  }

  protected _parseValue(value: unknown, ctx: ParseContext): InternalResult<TupleOutput<T>> {
    if (!Array.isArray(value)) {
      return fail([
        {
          path: ctx.path,
          type: "error",
          code: "invalid_type",
          key: "tuple.invalid_type",
          params: { expected: "array", received: typeOf(value) },
        },
      ]);
    }

    if (value.length !== this.elements.length) {
      return fail([
        {
          path: ctx.path,
          type: "error",
          code: "length",
          key: "tuple.length",
          params: { length: this.elements.length },
        },
      ]);
    }

    const output: unknown[] = [];
    const issues: Issue[] = [];

    for (let i = 0; i < this.elements.length; i++) {
      const result = this.elements[i]!._parse(value[i], { path: [...ctx.path, i] });
      if (result.success) {
        output.push(result.data);
        if (result.issues?.length) issues.push(...result.issues);
      } else {
        issues.push(...result.issues);
      }
    }

    if (hasErrorSeverity(issues)) return fail(issues);
    return ok(output as TupleOutput<T>, issues);
  }
}

export function tuple<T extends Elements, const R extends RequiredOption = false>(
  elements: T,
  options: CommonOptions<TupleOutput<T>, R> = {},
): TupleSchema<T, R> {
  return new TupleSchema(elements, options);
}
