import { fail, hasErrorSeverity, ok, type InternalResult } from "./error.ts";
import { ConfigurableSchema, Schema, type CommonOptions, type RequiredOption } from "./schema.ts";
import type { Issue, ParseContext } from "./types.ts";
import { typeOf } from "./types.ts";

export interface ArrayOptions<T, R extends RequiredOption> extends CommonOptions<T[], R> {
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly length?: number;
}

export class ArraySchema<T, const R extends RequiredOption = false> extends ConfigurableSchema<T[], R> {
  readonly typeName = "array";
  readonly element: Schema<T>;
  private readonly arrayOptions: ArrayOptions<T, R>;

  constructor(element: Schema<T>, arrayOptions: ArrayOptions<T, R> = {}) {
    super(arrayOptions);
    this.element = element;
    this.arrayOptions = arrayOptions;
  }

  protected _parseValue(value: unknown, ctx: ParseContext): InternalResult<T[]> {
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

    const o = this.arrayOptions;
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
    // 要素数が合わないときは要素を見ない。上限を超えた配列の全要素を検証して、issueを量産しないため。
    if (lengthIssues.length > 0) return fail(lengthIssues);

    const output: T[] = [];
    const issues: Issue[] = [];

    for (let i = 0; i < value.length; i++) {
      const itemResult = this.element._parse(value[i], { path: [...ctx.path, i] });
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

export function array<T, const R extends RequiredOption = false>(
  element: Schema<T>,
  options: ArrayOptions<T, R> = {},
): ArraySchema<T, R> {
  return new ArraySchema(element, options);
}
