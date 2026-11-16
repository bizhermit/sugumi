import { fail, hasErrorSeverity, ok, SchemaError, type InternalResult, type ParseResult } from "./error.ts";
import type { Issue, IssueSeverity, ParseContext } from "./types.ts";

export abstract class Schema<Output> {
  declare readonly _output: Output;

  abstract _parse(input: unknown, ctx: ParseContext): InternalResult<Output>;

  parse(input: unknown): Output {
    const result = this._parse(input, { path: [] });
    if (!result.success) throw new SchemaError(result.issues);
    return result.data;
  }

  safeParse(input: unknown): ParseResult<Output> {
    const result = this._parse(input, { path: [] });
    return result.success ? result : { success: false, error: new SchemaError(result.issues) };
  }
}

export type Infer<T extends Schema<any>> = T extends Schema<infer O> ? O : never;

export type RequiredOption = boolean | { readonly nullable?: boolean };

export function isRequired(required: RequiredOption | undefined): boolean {
  return required === true || typeof required === "object";
}

export function allowsNull(required: RequiredOption | undefined): boolean {
  return typeof required === "object" && required.nullable === true;
}

export type Nullish<T, R extends RequiredOption> =
  | T
  | (R extends true | object ? never : undefined | null)
  | (R extends { readonly nullable: true } ? null : never);

export interface RefineIssue {
  readonly code: string;
  readonly key?: string;
  readonly params?: Record<string, unknown>;
  readonly type?: IssueSeverity;
}

export interface CommonOptions<T, R extends RequiredOption> {
  readonly required?: R;
  readonly default?: T | (() => T);
  readonly strict?: boolean;
  readonly label?: string;
  readonly refine?: (value: T) => RefineIssue | RefineIssue[] | false | null | undefined | void;
}

export abstract class ConfigurableSchema<T, R extends RequiredOption> extends Schema<Nullish<T, R>> {
  abstract readonly typeName: string;
  abstract readonly options: Readonly<CommonOptions<T, R>>;

  get required(): boolean {
    return isRequired(this.options.required);
  }

  protected abstract _parseValue(value: unknown, ctx: ParseContext): InternalResult<T>;

  withOptions<const R2 extends RequiredOption = R>(patch: Partial<CommonOptions<T, R2>>): ConfigurableSchema<T, R2> {
    return this.replaceOptions({ ...this.options, ...patch } as CommonOptions<T, R2>);
  }

  optional(): ConfigurableSchema<T, false> {
    const { default: _default, ...rest } = this.options;
    return this.replaceOptions({ ...rest, required: false });
  }

  private replaceOptions<R2 extends RequiredOption>(merged: CommonOptions<T, R2>): ConfigurableSchema<T, R2> {
    const clone = Object.create(Object.getPrototypeOf(this)) as ConfigurableSchema<T, R2>;
    return Object.assign(clone, this, { options: merged });
  }

  protected _preprocess(value: unknown): unknown {
    return value;
  }

  acceptsEmptyString(): boolean {
    return false;
  }

  private withLabel(issue: Issue, ctx: ParseContext): Issue {
    const label = this.options.label;
    if (label == null || issue.path.length !== ctx.path.length) return issue;
    // pathが長いissueは子から上がってきたものであるため、子のlabelを親のlabelで上書きしない。
    return { ...issue, params: { ...issue.params, label } };
  }

  _parse(input: unknown, ctx: ParseContext): InternalResult<Nullish<T, R>> {
    const o = this.options;
    let value = o.strict ? input : this._preprocess(input);

    if (typeof value === "string" && value.trim() === "" && !this.acceptsEmptyString()) {
      value = null;
    }

    if (value === undefined && o.default !== undefined) {
      value = typeof o.default === "function" ? (o.default as () => T)() : o.default;
    }

    if (value == null) {
      if (isRequired(o.required) && !(value === null && allowsNull(o.required))) {
        return fail([
          this.withLabel(
            { path: ctx.path, type: "error", code: "required", key: `${this.typeName}.required`, params: {} },
            ctx,
          ),
        ]);
      }
      return ok(value as Nullish<T, R>);
    }

    const result = this._parseValue(value, ctx);
    if (!result.success) {
      return fail(result.issues.map((issue) => this.withLabel(issue, ctx)));
    }

    const issues = (result.issues ?? []).map((issue) => this.withLabel(issue, ctx));

    if (o.refine) {
      const refined = o.refine(result.data);
      for (const item of refined ? (Array.isArray(refined) ? refined : [refined]) : []) {
        issues.push(
          this.withLabel(
            {
              path: ctx.path,
              type: item.type ?? "error",
              code: item.code,
              key: item.key ?? `${this.typeName}.${item.code}`,
              params: item.params ?? {},
            },
            ctx,
          ),
        );
      }
    }

    if (hasErrorSeverity(issues)) return fail(issues);
    return ok(result.data as unknown as Nullish<T, R>, issues);
  }
}
