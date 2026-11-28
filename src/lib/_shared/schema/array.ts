import { fail, hasErrorSeverity, ok, type InternalResult } from "./error.ts";
import { ConfigurableSchema, Schema, type CommonOptions, type Resolved, type Options } from "./schema.ts";
import type { Dynamic, Issue, ParseContext } from "./types.ts";
import { typeOf } from "./types.ts";

export interface ArrayOptions<T> extends CommonOptions<T[]> {
  readonly minLength?: Dynamic<number>;
  readonly maxLength?: Dynamic<number>;
  readonly length?: Dynamic<number>;
}

export class ArraySchema<T, const O extends ArrayOptions<T> = {}> extends ConfigurableSchema<T[], O> {
  readonly typeName = "array";
  readonly element: Schema<T>;
  declare readonly options: Options<O, ArrayOptions<T>>;

  constructor(element: Schema<T>, options: O & ArrayOptions<T>) {
    super(options);
    this.element = element;
  }

  protected _parseValue(value: unknown, ctx: ParseContext, o: Resolved<ArrayOptions<T>>): InternalResult<T[]> {
    if (!Array.isArray(value)) {
      return fail([
        {
          path: ctx.path,
          type: "error",
          code: "invalid_type",
          key: "array.invalid_type",
          params: { expected: "array", received: typeOf(value) },
        },
      ]);
    }

    const lengthIssues: Issue[] = [];

    if (o.length != null && value.length !== o.length) {
      lengthIssues.push({
        path: ctx.path,
        type: "error",
        code: "length",
        key: "array.length",
        params: { length: o.length },
      });
    }
    if (o.minLength != null && value.length < o.minLength) {
      lengthIssues.push({ path: ctx.path, type: "error", code: "min", key: "array.min", params: { min: o.minLength } });
    }
    if (o.maxLength != null && value.length > o.maxLength) {
      lengthIssues.push({ path: ctx.path, type: "error", code: "max", key: "array.max", params: { max: o.maxLength } });
    }
    if (lengthIssues.length > 0) return fail(lengthIssues);

    const output: T[] = [];
    const issues: Issue[] = [];

    for (let i = 0; i < value.length; i++) {
      const itemResult = this.element._parse(value[i], { ...ctx, path: [...ctx.path, i] });
      if (itemResult.success) {
        output.push(itemResult.data);
        if (itemResult.issues?.length) issues.push(...itemResult.issues);
      } else {
        issues.push(...itemResult.issues);
      }
    }

    if (hasErrorSeverity(issues)) return fail(issues);
    return ok(output, issues);
  }
}

export function $array<T, const O extends ArrayOptions<T> = {}>(
  element: Schema<T>,
  options: O & ArrayOptions<T> = {} as O,
): ArraySchema<T, O> {
  return new ArraySchema(element, options);
}
