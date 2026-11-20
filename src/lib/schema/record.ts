import { fail, hasErrorSeverity, ok, type InternalResult } from "./error.ts";
import { ConfigurableSchema, Schema, type CommonOptions, type Resolved, type Options } from "./schema.ts";
import type { Dynamic, Issue, ParseContext } from "./types.ts";
import { typeOf } from "./types.ts";

export interface RecordOptions<T> extends CommonOptions<Record<string, T>> {
  readonly minLength?: Dynamic<number>;
  readonly maxLength?: Dynamic<number>;
  readonly length?: Dynamic<number>;
}

export class RecordSchema<T, const O extends RecordOptions<T> = {}> extends ConfigurableSchema<Record<string, T>, O> {
  readonly typeName = "record";
  readonly element: Schema<T>;
  declare readonly options: Options<O, RecordOptions<T>>;

  constructor(element: Schema<T>, options: O & RecordOptions<T>) {
    super(options);
    this.element = element;
  }

  protected _parseValue(
    value: unknown,
    ctx: ParseContext,
    o: Resolved<RecordOptions<T>>,
  ): InternalResult<Record<string, T>> {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return fail([
        {
          path: ctx.path,
          type: "error",
          code: "invalid_type",
          key: "record.invalid_type",
          params: { expected: "object", received: typeOf(value) },
        },
      ]);
    }

    const input = value as Record<string, unknown>;
    const keys = Object.keys(input);
    const lengthIssues: Issue[] = [];

    if (o.length != null && keys.length !== o.length) {
      lengthIssues.push({
        path: ctx.path,
        type: "error",
        code: "length",
        key: "record.length",
        params: { length: o.length },
      });
    }
    if (o.minLength != null && keys.length < o.minLength) {
      lengthIssues.push({
        path: ctx.path,
        type: "error",
        code: "min",
        key: "record.min",
        params: { min: o.minLength },
      });
    }
    if (o.maxLength != null && keys.length > o.maxLength) {
      lengthIssues.push({
        path: ctx.path,
        type: "error",
        code: "max",
        key: "record.max",
        params: { max: o.maxLength },
      });
    }
    if (lengthIssues.length > 0) return fail(lengthIssues);

    const output: Record<string, T> = {};
    const issues: Issue[] = [];

    for (const key of keys) {
      const result = this.element._parse(input[key], { ...ctx, path: [...ctx.path, key] });
      if (result.success) {
        Object.defineProperty(output, key, {
          value: result.data,
          enumerable: true,
          writable: true,
          configurable: true,
        });

        if (result.issues?.length) issues.push(...result.issues);
      } else {
        issues.push(...result.issues);
      }
    }

    if (hasErrorSeverity(issues)) return fail(issues);
    return ok(output, issues);
  }
}

export function record<T, const O extends RecordOptions<T> = {}>(
  element: Schema<T>,
  options: O & RecordOptions<T> = {} as O,
): RecordSchema<T, O> {
  return new RecordSchema(element, options);
}
