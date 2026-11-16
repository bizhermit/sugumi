import {
  assertTimeZone,
  getAppTimeZone,
  fromDate,
  parseDate,
  parseDateTime,
  parseTime,
  toDateTimeInputValue,
  toTimeInputValue,
} from "../date.ts";
import { parseNumber } from "../number.ts";
import { graphemeLength, toHalfWidth, toHyphen } from "../string.ts";
import { fail, ok, type InternalResult } from "./error.ts";
import { ConfigurableSchema, type CommonOptions, type RequiredOption } from "./schema.ts";
import type { Issue, ParseContext } from "./types.ts";
import { typeOf } from "./types.ts";

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
  readonly options: StringOptions<R>;

  constructor(options: StringOptions<R> = {}) {
    super();
    this.options = options;
    if (options.pattern?.global || options.pattern?.sticky) {
      throw new Error("patternにg/yフラグは使用できません。");
    }
  }

  protected _preprocess(value: unknown): unknown {
    if (typeof value === "number" || typeof value === "boolean") {
      return String(value);
    }
    // 電話番号は全角や長音で入力されることが多いため、半角とハイフンに揃える。
    if (typeof value === "string" && this.options.type === "tel") {
      return toHyphen(toHalfWidth(value));
    }
    return value;
  }

  acceptsEmptyString(): boolean {
    return this.options.allowEmpty === true;
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

    const o = this.options;
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
  readonly options: NumberOptions<R>;

  constructor(options: NumberOptions<R> = {}) {
    super();
    this.options = options;
  }

  protected _preprocess(value: unknown): unknown {
    if (typeof value !== "string") return value;
    return parseNumber(value) ?? value;
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

    const o = this.options;
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

export class BooleanSchema<const R extends BooleanRequiredOption = false> extends ConfigurableSchema<boolean, R> {
  readonly typeName = "boolean";
  readonly options: CommonOptions<boolean, R>;

  constructor(options: CommonOptions<boolean, R> = {}) {
    super();
    this.options = options;
  }

  get disallowFalse(): boolean {
    const required = this.options.required;
    return typeof required === "object" && required.disallowFalse === true;
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

  protected _parseValue(value: unknown, ctx: ParseContext): InternalResult<boolean> {
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
    return ok(value);
  }
}

export function boolean<const R extends BooleanRequiredOption = false>(
  options: CommonOptions<boolean, R> = {},
): BooleanSchema<R> {
  return new BooleanSchema(options);
}

export interface DateOptions<R extends RequiredOption> extends CommonOptions<Temporal.PlainDate, R> {
  readonly min?: Temporal.PlainDate;
  readonly max?: Temporal.PlainDate;
}

export class DateSchema<const R extends RequiredOption = false> extends ConfigurableSchema<Temporal.PlainDate, R> {
  readonly typeName = "date";
  readonly options: DateOptions<R>;

  constructor(options: DateOptions<R> = {}) {
    super();
    this.options = options;
  }

  protected _preprocess(value: unknown): unknown {
    if (typeof value !== "string") return value;
    return parseDate(value.trim()) ?? value;
  }

  protected _parseValue(value: unknown, ctx: ParseContext): InternalResult<Temporal.PlainDate> {
    if (!(value instanceof Temporal.PlainDate)) {
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

    const o = this.options;
    const issues: Issue[] = [];

    if (o.min != null && Temporal.PlainDate.compare(value, o.min) < 0) {
      issues.push({ path: ctx.path, type: "error", code: "min", key: "date.min", params: { min: o.min.toString() } });
    }
    if (o.max != null && Temporal.PlainDate.compare(value, o.max) > 0) {
      issues.push({ path: ctx.path, type: "error", code: "max", key: "date.max", params: { max: o.max.toString() } });
    }

    if (issues.length > 0) return fail(issues);
    return ok(value);
  }
}

export function date<const R extends RequiredOption = false>(options: DateOptions<R> = {}): DateSchema<R> {
  return new DateSchema(options);
}

export interface DateTimeOptions<R extends RequiredOption> extends CommonOptions<Temporal.ZonedDateTime, R> {
  readonly min?: Temporal.ZonedDateTime;
  readonly max?: Temporal.ZonedDateTime;
  readonly timeZone?: string;
}

export class DateTimeSchema<const R extends RequiredOption = false> extends ConfigurableSchema<
  Temporal.ZonedDateTime,
  R
> {
  readonly typeName = "datetime";
  readonly options: DateTimeOptions<R>;

  constructor(options: DateTimeOptions<R> = {}) {
    super();
    if (options.timeZone != null) assertTimeZone(options.timeZone);
    this.options = options;
  }

  get timeZone(): string {
    return this.options.timeZone ?? getAppTimeZone();
  }

  protected _preprocess(value: unknown): unknown {
    const timeZone = this.timeZone;
    if (typeof value === "string") return parseDateTime(value.trim(), timeZone) ?? value;
    if (value instanceof Date && !Number.isNaN(value.getTime())) return fromDate(value, timeZone);
    if (value instanceof Temporal.Instant) return value.toZonedDateTimeISO(timeZone);
    return value;
  }

  protected _parseValue(value: unknown, ctx: ParseContext): InternalResult<Temporal.ZonedDateTime> {
    if (!(value instanceof Temporal.ZonedDateTime)) {
      return fail([
        {
          path: ctx.path,
          type: "error",
          code: "invalid_type",
          key: "datetime.invalid_type",
          params: { expected: "datetime", received: typeOf(value) },
        },
      ]);
    }

    const o = this.options;
    const issues: Issue[] = [];

    if (o.min != null && Temporal.ZonedDateTime.compare(value, o.min) < 0) {
      issues.push({
        path: ctx.path,
        type: "error",
        code: "min",
        key: "datetime.min",
        params: { min: toDateTimeInputValue(o.min.withTimeZone(this.timeZone)) },
      });
    }
    if (o.max != null && Temporal.ZonedDateTime.compare(value, o.max) > 0) {
      issues.push({
        path: ctx.path,
        type: "error",
        code: "max",
        key: "datetime.max",
        params: { max: toDateTimeInputValue(o.max.withTimeZone(this.timeZone)) },
      });
    }

    if (issues.length > 0) return fail(issues);
    return ok(value);
  }
}

export function datetime<const R extends RequiredOption = false>(options: DateTimeOptions<R> = {}): DateTimeSchema<R> {
  return new DateTimeSchema(options);
}

export interface TimeOptions<R extends RequiredOption> extends CommonOptions<Temporal.PlainTime, R> {
  readonly min?: Temporal.PlainTime;
  readonly max?: Temporal.PlainTime;
}

export class TimeSchema<const R extends RequiredOption = false> extends ConfigurableSchema<Temporal.PlainTime, R> {
  readonly typeName = "time";
  readonly options: TimeOptions<R>;

  constructor(options: TimeOptions<R> = {}) {
    super();
    this.options = options;
  }

  protected _preprocess(value: unknown): unknown {
    if (typeof value !== "string") return value;
    return parseTime(value.trim()) ?? value;
  }

  protected _parseValue(value: unknown, ctx: ParseContext): InternalResult<Temporal.PlainTime> {
    if (!(value instanceof Temporal.PlainTime)) {
      return fail([
        {
          path: ctx.path,
          type: "error",
          code: "invalid_type",
          key: "time.invalid_type",
          params: { expected: "time", received: typeOf(value) },
        },
      ]);
    }

    const o = this.options;
    const issues: Issue[] = [];

    if (o.min != null && Temporal.PlainTime.compare(value, o.min) < 0) {
      issues.push({
        path: ctx.path,
        type: "error",
        code: "min",
        key: "time.min",
        params: { min: toTimeInputValue(o.min) },
      });
    }
    if (o.max != null && Temporal.PlainTime.compare(value, o.max) > 0) {
      issues.push({
        path: ctx.path,
        type: "error",
        code: "max",
        key: "time.max",
        params: { max: toTimeInputValue(o.max) },
      });
    }

    if (issues.length > 0) return fail(issues);
    return ok(value);
  }
}

export function time<const R extends RequiredOption = false>(options: TimeOptions<R> = {}): TimeSchema<R> {
  return new TimeSchema(options);
}

type Literal = string | number | boolean;

export class LiteralSchema<T extends Literal, const R extends RequiredOption = false> extends ConfigurableSchema<T, R> {
  readonly typeName = "literal";
  private readonly literalValue: T;

  readonly options: CommonOptions<T, R>;

  constructor(literalValue: T, options: CommonOptions<T, R> = {}) {
    super();
    this.options = options;
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

  readonly options: CommonOptions<any, R>;

  constructor(options: CommonOptions<any, R> = {}) {
    super();
    this.options = options;
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

  readonly options: CommonOptions<unknown, R>;

  constructor(options: CommonOptions<unknown, R> = {}) {
    super();
    this.options = options;
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
