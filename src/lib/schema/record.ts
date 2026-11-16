import { fail, hasErrorSeverity, ok, type InternalResult } from "./error.ts";
import { ConfigurableSchema, Schema, type CommonOptions, type RequiredOption } from "./schema.ts";
import type { Issue, ParseContext } from "./types.ts";
import { typeOf } from "./types.ts";

export interface RecordOptions<T, R extends RequiredOption> extends CommonOptions<Record<string, T>, R> {
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly length?: number;
}

export class RecordSchema<T, const R extends RequiredOption = false> extends ConfigurableSchema<Record<string, T>, R> {
  readonly typeName = "record";
  readonly element: Schema<T>;
  readonly options: RecordOptions<T, R>;

  constructor(element: Schema<T>, options: RecordOptions<T, R> = {}) {
    super();
    this.options = options;
    this.element = element;
  }

  protected _parseValue(value: unknown, ctx: ParseContext): InternalResult<Record<string, T>> {
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
    const o = this.options;
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
      const result = this.element._parse(input[key], { path: [...ctx.path, key] });
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

export function record<T, const R extends RequiredOption = false>(
  element: Schema<T>,
  options: RecordOptions<T, R> = {},
): RecordSchema<T, R> {
  return new RecordSchema(element, options);
}
