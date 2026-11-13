import { fail, ok, type InternalResult } from "./error.ts";
import { ConfigurableSchema, type CommonOptions, type RequiredOption } from "./schema.ts";
import type { Issue, ParseContext } from "./types.ts";
import { typeOf } from "./types.ts";

const segmenter = new Intl.Segmenter();

function graphemeLength(value: string): number {
  let count = 0;
  for (const _ of segmenter.segment(value)) count++;
  return count;
}

export type StringType = "email" | "tel" | "url";

function isIpv4Address(value: string): boolean {
  const s = value.split(".");
  if (s.length !== 4) return false;
  for (const numStr of s) {
    if (!/^(0|[1-9]\d{0,2})$/.test(numStr)) return false;
    const num = Number(numStr);
    if (num < 0 || num > 255) return false;
  }
  return true;
}

function isEmail(value: string): boolean {
  if (!value) return false;
  let quoted = false,
    escape = false;
  const arr = Array.from(value);
  for (let i = 0, il = arr.length; i < il; i++) {
    const c = arr[i] ?? "";
    if ("@" === c && !quoted) {
      // console.log("local:", str.slice(0, i));
      if (i < 1 || i > 64) {
        // console.log("[x] local len", i, str);
        return false;
      }
      if ("." === arr[i - 1]) {
        // console.log("[x] local-part dot end", str);
        return false;
      }
      // domain
      const domain = arr.slice(i + 1).join("");
      // console.log("domain:", domain);
      if (domain.length > 253 || domain.split(".").some((label) => label.length > 63)) {
        // console.log("[x] domain len", strLength(domain), str);
        return false;
      }
      const ctx = domain.match(
        /^(?:(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}|(?:\[((?:[0-9]{1,3}\.){3}[0-9]{1,3})\])|(?:((?:[0-9]{1,3}\.){3}[0-9]{1,3}))|(?:\[(?:IPv6:[a-fA-F0-9:]+\])))$/,
      );
      if (!ctx) {
        // console.log("[x] un domain", str);
        return false;
      }
      const ipv4 = ctx[1] ?? ctx[2];
      if (ipv4) return isIpv4Address(ipv4);
      return true;
    }
    // local
    if (('"' === c || "”" === c) && !escape) {
      if (quoted) {
        const next = arr[i + 1];
        if ("." !== next && "@" !== next) {
          // console.log("[x] quote not end of part", `[${str[i - 1]}${c}${str[i + 1]}]`, i, str);
          return false;
        }
      } else {
        const prev = arr[i - 1];
        if (prev && "." !== prev) {
          // console.log("[x] quote not start of part", `[${c}]`, i, str);
          return false;
        }
      }
      quoted = !quoted;
      continue;
    }
    if (quoted) {
      if (escape) {
        if (!/[\x01-\x09\x0b\x0c\x0e-\x7f\\ ]/.test(c)) {
          // console.log("[x] not allow quoted/escape char", `[${c}]`, str);
          return false;
        }
      } else {
        if ("\\" === c) {
          escape = true;
          continue;
        }
        if (!/[\x01-\x08\x0b\x0c\x0e-\x1f\x21\x23-\x5b\x5d-\x7f ]/.test(c)) {
          // console.log("[x] not allow quoted char", `[${c}]`, str);
          return false;
        }
      }
    } else {
      if (!/[.a-zA-Z0-9!#$%&'*+/=?^_`{|}~-]/.test(c)) {
        // console.log("[x] not allow char", `[${c}]`, str);
        return false;
      }
      if ("." === c) {
        if (i === 0 || "." === value[i - 1]) {
          // console.log("[x] dot failed", str);
          return false;
        }
      }
    }
    escape = false;
  }
  // console.log("[x] no domain", str);
  return false;
}

const TEL_PATTERN = /^(?=.*\d)\+?[\d\-() ]+$/; // 国ごとに形式が異なるため、固定パターンは寛容とする

function isHttpUrl(value: string): boolean {
  if (!URL.canParse(value)) return false;
  const { protocol } = new URL(value);
  return protocol === "http:" || protocol === "https:";
}

const STRING_TYPE_CHECKS: Record<StringType, (value: string) => boolean> = {
  email: isEmail,
  tel: (value) => TEL_PATTERN.test(value),
  url: isHttpUrl,
};

export interface StringOptions<R extends RequiredOption> extends CommonOptions<string, R> {
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly length?: number;
  readonly trim?: boolean;
  readonly allowEmpty?: boolean;
  readonly type?: StringType;
  readonly pattern?: RegExp;
}

export class StringSchema<const R extends RequiredOption = false> extends ConfigurableSchema<string, R> {
  readonly typeName = "string";
  private readonly stringOptions: StringOptions<R>;

  constructor(stringOptions: StringOptions<R> = {}) {
    super(stringOptions);
    this.stringOptions = stringOptions;
    if (stringOptions.pattern?.global || stringOptions.pattern?.sticky) {
      throw new Error("patternにg/yフラグは使用できません。");
    }
  }

  protected _preprocess(value: unknown): unknown {
    if (typeof value === "number" || typeof value === "boolean") {
      return String(value);
    }
    return value;
  }

  acceptsEmptyString(): boolean {
    return this.stringOptions.allowEmpty === true;
  }

  protected _parseValue(input: unknown, ctx: ParseContext): InternalResult<string> {
    if (typeof input !== "string") {
      return fail([
        {
          path: ctx.path,
          type: "error",
          code: "invalid_type",
          key: "string.invalid_type",
          params: { expected: "string", received: typeOf(input) },
        },
      ]);
    }

    const o = this.stringOptions;
    const value = o.trim === false ? input : input.trim();
    const issues: Issue[] = [];
    const needsLength = o.length != null || o.minLength != null || o.maxLength != null;
    const length = needsLength ? graphemeLength(value) : 0;

    if (o.length != null && length !== o.length) {
      issues.push({
        path: ctx.path,
        type: "error",
        code: "length",
        key: "string.length",
        params: { length: o.length },
      });
    }
    if (o.minLength != null && length < o.minLength) {
      issues.push({ path: ctx.path, type: "error", code: "min", key: "string.min", params: { min: o.minLength } });
    }
    if (o.maxLength != null && length > o.maxLength) {
      issues.push({ path: ctx.path, type: "error", code: "max", key: "string.max", params: { max: o.maxLength } });
    }
    if (o.pattern && !o.pattern.test(value)) {
      issues.push({
        path: ctx.path,
        type: "error",
        code: "pattern",
        key: "string.pattern",
        params: { pattern: o.pattern.source },
      });
    }
    if (o.type != null && !STRING_TYPE_CHECKS[o.type](value)) {
      issues.push({ path: ctx.path, type: "error", code: o.type, key: `string.${o.type}`, params: {} });
    }

    if (issues.length > 0) return fail(issues);
    return ok(value);
  }
}

export function string<const R extends RequiredOption = false>(options: StringOptions<R> = {}): StringSchema<R> {
  return new StringSchema(options);
}

export interface NumberOptions<R extends RequiredOption> extends CommonOptions<number, R> {
  readonly type?: "int" | "float";
  readonly min?: number;
  readonly max?: number;
  readonly sign?: "positive" | "negative" | "nonnegative";
  readonly decimals?: number;
}

const DECIMAL_PATTERN = /^[+-]?\d+(?:\.\d+)?$/; // Number()は"0x10"や"1e3"や"Infinity"も数値にするため、10進数のみ許可。

function decimalPlaces(value: number): number {
  if (Number.isInteger(value)) return 0;
  // 1.2e-7のような小さい値はtoString()が指数表記になるため、小数で書いたとき（0.00000012）の桁数に直して数える。
  const str = Math.abs(value).toString();
  const match = /^(\d+)(?:\.(\d+))?e([+-]\d+)$/i.exec(str);
  if (match) {
    const fractionLength = match[2]?.length ?? 0;
    return Math.max(0, fractionLength - Number(match[3]));
  }
  const dot = str.indexOf(".");
  return dot === -1 ? 0 : str.length - dot - 1;
}

export class NumberSchema<const R extends RequiredOption = false> extends ConfigurableSchema<number, R> {
  readonly typeName = "number";
  private readonly numberOptions: NumberOptions<R>;

  constructor(numberOptions: NumberOptions<R> = {}) {
    super(numberOptions);
    this.numberOptions = numberOptions;
  }

  protected _preprocess(value: unknown): unknown {
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    return DECIMAL_PATTERN.test(trimmed) ? Number(trimmed) : value;
  }

  protected _parseValue(value: unknown, ctx: ParseContext): InternalResult<number> {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return fail([
        {
          path: ctx.path,
          type: "error",
          code: "invalid_type",
          key: "number.invalid_type",
          params: { expected: "number", received: typeOf(value) },
        },
      ]);
    }

    const o = this.numberOptions;
    const issues: Issue[] = [];

    if (o.type === "int" && !Number.isInteger(value)) {
      issues.push({ path: ctx.path, type: "error", code: "int", key: "number.int", params: {} });
    }
    if (o.decimals != null && decimalPlaces(value) > o.decimals) {
      issues.push({
        path: ctx.path,
        type: "error",
        code: "decimals",
        key: "number.decimals",
        params: { decimals: o.decimals },
      });
    }
    if (o.min != null && value < o.min) {
      issues.push({ path: ctx.path, type: "error", code: "min", key: "number.min", params: { min: o.min } });
    }
    if (o.max != null && value > o.max) {
      issues.push({ path: ctx.path, type: "error", code: "max", key: "number.max", params: { max: o.max } });
    }
    switch (o.sign) {
      case "positive":
        if (value <= 0) {
          issues.push({ path: ctx.path, type: "error", code: "positive", key: "number.positive", params: {} });
        }
        break;
      case "negative":
        if (value >= 0) {
          issues.push({ path: ctx.path, type: "error", code: "negative", key: "number.negative", params: {} });
        }
        break;
      case "nonnegative":
        if (value < 0) {
          issues.push({ path: ctx.path, type: "error", code: "nonnegative", key: "number.nonnegative", params: {} });
        }
        break;
      case undefined:
        break;
    }

    if (issues.length > 0) return fail(issues);
    return ok(value);
  }
}

export function number<const R extends RequiredOption = false>(options: NumberOptions<R> = {}): NumberSchema<R> {
  return new NumberSchema(options);
}

export type BooleanRequiredOption = boolean | { readonly nullable?: boolean; readonly disallowFalse?: boolean };

type BooleanOutput<R extends BooleanRequiredOption> = R extends { readonly disallowFalse: true } ? true : boolean;

export class BooleanSchema<const R extends BooleanRequiredOption = false> extends ConfigurableSchema<
  BooleanOutput<R>,
  R
> {
  readonly typeName = "boolean";
  private readonly disallowFalse: boolean;

  constructor(options: CommonOptions<BooleanOutput<R>, R> = {}) {
    super(options);
    this.disallowFalse = typeof options.required === "object" && options.required.disallowFalse === true;
  }

  protected _preprocess(value: unknown): unknown {
    if (typeof value !== "string") return value;
    switch (value.toLowerCase()) {
      case "true":
      case "on":
        return true;
      case "false":
      case "off":
        return false;
      default:
        return value;
    }
  }

  protected _parseValue(value: unknown, ctx: ParseContext): InternalResult<BooleanOutput<R>> {
    if (typeof value !== "boolean") {
      return fail([
        {
          path: ctx.path,
          type: "error",
          code: "invalid_type",
          key: "boolean.invalid_type",
          params: { expected: "boolean", received: typeOf(value) },
        },
      ]);
    }
    if (!value && this.disallowFalse) {
      return fail([{ path: ctx.path, type: "error", code: "required", key: "boolean.required", params: {} }]);
    }
    return ok(value as BooleanOutput<R>);
  }
}

export function boolean<const R extends BooleanRequiredOption = false>(
  options: CommonOptions<BooleanOutput<R>, R> = {},
): BooleanSchema<R> {
  return new BooleanSchema(options);
}

export interface DateOptions<R extends RequiredOption> extends CommonOptions<Date, R> {
  readonly min?: Date;
  readonly max?: Date;
}

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:\d{2})?)?$/;

function daysInMonth(year: number, month: number): number {
  if (month === 2) return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

export function parseDateString(text: string): Date | undefined {
  const match = DATE_PATTERN.exec(text);
  if (match == null) return undefined;
  const [, year, month, day, hour, minute, second, millisecond, zone] = match;
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  if (m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) return undefined;
  if (hour != null && (Number(hour) > 23 || Number(minute) > 59 || Number(second ?? "0") > 59)) return undefined;
  if (zone == null) {
    const local = new Date(0);
    local.setFullYear(y, m - 1, d);
    local.setHours(
      Number(hour ?? "0"),
      Number(minute ?? "0"),
      Number(second ?? "0"),
      Number((millisecond ?? "0").padEnd(3, "0")),
    );
    return local;
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

export class DateSchema<const R extends RequiredOption = false> extends ConfigurableSchema<Date, R> {
  readonly typeName = "date";
  private readonly dateOptions: DateOptions<R>;

  constructor(dateOptions: DateOptions<R> = {}) {
    super(dateOptions);
    this.dateOptions = dateOptions;
  }

  protected _preprocess(value: unknown): unknown {
    if (typeof value !== "string") return value;
    return parseDateString(value.trim()) ?? value;
  }

  protected _parseValue(value: unknown, ctx: ParseContext): InternalResult<Date> {
    if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
      return fail([
        {
          path: ctx.path,
          type: "error",
          code: "invalid_type",
          key: "date.invalid_type",
          params: { expected: "date", received: typeOf(value) },
        },
      ]);
    }

    const o = this.dateOptions;
    const issues: Issue[] = [];

    if (o.min != null && value.getTime() < o.min.getTime()) {
      issues.push({
        path: ctx.path,
        type: "error",
        code: "min",
        key: "date.min",
        params: { min: o.min.toISOString() },
      });
    }
    if (o.max != null && value.getTime() > o.max.getTime()) {
      issues.push({
        path: ctx.path,
        type: "error",
        code: "max",
        key: "date.max",
        params: { max: o.max.toISOString() },
      });
    }

    if (issues.length > 0) return fail(issues);
    return ok(value);
  }
}

export function date<const R extends RequiredOption = false>(options: DateOptions<R> = {}): DateSchema<R> {
  return new DateSchema(options);
}

type Literal = string | number | boolean;

export class LiteralSchema<T extends Literal, const R extends RequiredOption = false> extends ConfigurableSchema<T, R> {
  readonly typeName = "literal";
  private readonly literalValue: T;

  constructor(literalValue: T, options: CommonOptions<T, R> = {}) {
    super(options);
    this.literalValue = literalValue;
  }

  protected _parseValue(value: unknown, ctx: ParseContext): InternalResult<T> {
    if (value !== this.literalValue) {
      return fail([
        {
          path: ctx.path,
          type: "error",
          code: "invalid_literal",
          key: "literal.invalid_literal",
          params: { expected: this.literalValue, received: value },
        },
      ]);
    }
    return ok(value as T);
  }
}

export function literal<T extends Literal, const R extends RequiredOption = false>(
  value: T,
  options: CommonOptions<T, R> = {},
): LiteralSchema<T, R> {
  return new LiteralSchema(value, options);
}

export class AnySchema<const R extends RequiredOption = false> extends ConfigurableSchema<any, R> {
  readonly typeName = "any";

  constructor(options: CommonOptions<any, R> = {}) {
    super(options);
  }

  protected _parseValue(value: unknown): InternalResult<any> {
    return ok(value);
  }
}

export function any<const R extends RequiredOption = false>(options: CommonOptions<any, R> = {}): AnySchema<R> {
  return new AnySchema(options);
}

export class UnknownSchema<const R extends RequiredOption = false> extends ConfigurableSchema<unknown, R> {
  readonly typeName = "unknown";

  constructor(options: CommonOptions<unknown, R> = {}) {
    super(options);
  }

  protected _parseValue(value: unknown): InternalResult<unknown> {
    return ok(value);
  }
}

export function unknown<const R extends RequiredOption = false>(
  options: CommonOptions<unknown, R> = {},
): UnknownSchema<R> {
  return new UnknownSchema(options);
}
