import { fail, hasErrorSeverity, ok, SchemaError, type InternalResult, type ParseResult } from "./error.ts";
import type { Dynamic, Issue, IssueSeverity, ParseContext, PathSegment } from "./types.ts";

export type ParseOptions = {
  /**
   * 動的な制約と refine に ctx.data として渡す。
   */
  readonly data?: Readonly<Record<string, unknown>> | undefined;
};

function rootContext(input: unknown, options: ParseOptions): ParseContext {
  const values =
    typeof input === "object" && input !== null && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
  return { path: [], values, data: options.data ?? {} };
}

export abstract class Schema<Output> {
  declare readonly _output: Output;

  abstract _parse(input: unknown, ctx: ParseContext): InternalResult<Output>;

  parse(input: unknown, options: ParseOptions = {}): Output {
    const result = this._parse(input, rootContext(input, options));
    if (!result.success) throw new SchemaError(result.issues);
    return result.data;
  }

  safeParse(input: unknown, options: ParseOptions = {}): ParseResult<Output> {
    const result = this._parse(input, rootContext(input, options));
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

type DynamicFunction = (ctx: ParseContext) => unknown;

type StaticRequired<R> = Exclude<R, DynamicFunction>;

export type RequiredOf<O> = O extends { readonly required: infer R }
  ? [StaticRequired<R>] extends [never]
    ? false
    : StaticRequired<R> extends boolean | object
      ? StaticRequired<R>
      : false
  : false;

export type Nullish<T, R extends boolean | object> =
  | T
  | (R extends true | object ? never : undefined | null)
  | (R extends { readonly nullable: true } ? null : never);

type ResolvedValue<V> = V extends DynamicFunction ? ReturnType<V> : V;

/**
 * 動的な option を値に直した options の型。
 */
export type Resolved<O> = {
  readonly [K in keyof O]: K extends "refine" | "default" ? O[K] : ResolvedValue<O[K]>;
};

/**
 * スキーマが持つ options の型。
 * - 渡した項目: 書いたとおりの型
 * - 省略した項目: All の型
 *
 * ※ instanceof で絞り込むと型引数が any になるため、そのときは All にする。
 */
export type Options<O, All> = 0 extends 1 & O ? All : O & Omit<All, keyof O>;

export interface RefineIssue {
  readonly code: string;
  readonly key?: string;
  readonly params?: Record<string, unknown>;
  readonly type?: IssueSeverity;
  readonly path?: readonly PathSegment[];
}

export interface CommonOptions<T> {
  readonly required?: Dynamic<RequiredOption>;
  readonly default?: T | (() => T);
  readonly strict?: boolean;
  readonly label?: string;
  readonly refine?: (value: T, ctx: ParseContext) => RefineIssue | RefineIssue[] | false | null | undefined | void;
}

type OptionalOptions<T, O> = Omit<O, "required" | "default"> & { readonly required: false } & CommonOptions<T>;

const NON_DYNAMIC_KEYS: ReadonlySet<string> = new Set(["refine", "default"]);

function dynamicKeys(options: object): string[] {
  return Object.entries(options)
    .filter(([key, value]) => typeof value === "function" && !NON_DYNAMIC_KEYS.has(key))
    .map(([key]) => key);
}

export abstract class ConfigurableSchema<T, O extends CommonOptions<T>> extends Schema<Nullish<T, RequiredOf<O>>> {
  abstract readonly typeName: string;
  readonly options: Options<O, CommonOptions<T>>;
  private readonly dynamicKeys: readonly string[];

  constructor(options: O & CommonOptions<T>) {
    super();
    this.options = options as Options<O, CommonOptions<T>>;
    this.dynamicKeys = dynamicKeys(options);
  }

  resolve(ctx: ParseContext): Resolved<this["options"]> {
    if (this.dynamicKeys.length === 0) return this.options as Resolved<this["options"]>;
    const resolved: Record<string, unknown> = { ...this.options };
    for (const key of this.dynamicKeys) {
      resolved[key] = (resolved[key] as DynamicFunction)(ctx);
    }
    return resolved as Resolved<this["options"]>;
  }

  protected abstract _parseValue(
    value: unknown,
    ctx: ParseContext,
    options: Resolved<this["options"]>,
  ): InternalResult<T>;

  optional(): ConfigurableSchema<T, OptionalOptions<T, O>> {
    const { default: _default, ...rest } = this.options;
    const options = { ...rest, required: false };
    const clone = Object.create(Object.getPrototypeOf(this)) as ConfigurableSchema<T, OptionalOptions<T, O>>;
    return Object.assign(clone, this, { options, dynamicKeys: dynamicKeys(options) });
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
    return { ...issue, params: { ...issue.params, label } };
  }

  _parse(input: unknown, ctx: ParseContext): InternalResult<Nullish<T, RequiredOf<O>>> {
    const o = this.resolve(ctx);
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
      return ok(value as Nullish<T, RequiredOf<O>>);
    }

    const result = this._parseValue(value, ctx, o);
    if (!result.success) {
      return fail(result.issues.map((issue) => this.withLabel(issue, ctx)));
    }

    const issues = (result.issues ?? []).map((issue) => this.withLabel(issue, ctx));

    if (o.refine) {
      const refined = o.refine(result.data, ctx);
      for (const item of refined ? (Array.isArray(refined) ? refined : [refined]) : []) {
        issues.push(
          this.withLabel(
            {
              path: item.path == null ? ctx.path : [...ctx.path, ...item.path],
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
    return ok(result.data as unknown as Nullish<T, RequiredOf<O>>, issues);
  }
}
