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
import { ConfigurableSchema, type CommonOptions, type Options, type Resolved } from "./schema.ts";
import type { Dynamic, Issue, ParseContext } from "./types.ts";
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

export interface StringOptions extends CommonOptions<string> {
  readonly minLength?: Dynamic<number>;
  readonly maxLength?: Dynamic<number>;
  readonly length?: Dynamic<number>;
  readonly trim?: boolean;
  readonly allowEmpty?: boolean;
  readonly type?: StringType;
  readonly pattern?: Dynamic<RegExp>;
}

export class StringSchema<const O extends StringOptions = {}> extends ConfigurableSchema<string, O> {
  readonly typeName = "string";
  declare readonly options: Options<O, StringOptions>;

  constructor(options: O & StringOptions) {
    super(options);
    if (typeof options.pattern === "object" && (options.pattern.global || options.pattern.sticky)) {
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

  protected _parseValue(input: unknown, ctx: ParseContext, o: Resolved<StringOptions>): InternalResult<string> {
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
    // 静的な pattern はコンストラクタで確かめている。関数が返した RegExp はここでしか確かめられない。
    if (typeof this.options.pattern === "function" && o.pattern != null && (o.pattern.global || o.pattern.sticky)) {
      throw new Error("patternにg/yフラグは使用できません。");
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

export function string<const O extends StringOptions = {}>(options: O & StringOptions = {} as O): StringSchema<O> {
  return new StringSchema(options);
}

export interface NumberOptions extends CommonOptions<number> {
  readonly type?: "int" | "float";
  readonly min?: Dynamic<number>;
  readonly max?: Dynamic<number>;
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

export class NumberSchema<const O extends NumberOptions = {}> extends ConfigurableSchema<number, O> {
  readonly typeName = "number";
  declare readonly options: Options<O, NumberOptions>;

  protected _preprocess(value: unknown): unknown {
    if (typeof value !== "string") return value;
    return parseNumber(value) ?? value;
  }

  protected _parseValue(value: unknown, ctx: ParseContext, o: Resolved<NumberOptions>): InternalResult<number> {
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

export function number<const O extends NumberOptions = {}>(options: O & NumberOptions = {} as O): NumberSchema<O> {
  return new NumberSchema(options);
}

export type BooleanRequiredOption = boolean | { readonly nullable?: boolean; readonly disallowFalse?: boolean };

export interface BooleanOptions extends CommonOptions<boolean> {
  readonly required?: Dynamic<BooleanRequiredOption>;
}

export function disallowsFalse(required: BooleanRequiredOption | undefined): boolean {
  return typeof required === "object" && required.disallowFalse === true;
}

export class BooleanSchema<const O extends BooleanOptions = {}> extends ConfigurableSchema<boolean, O> {
  readonly typeName = "boolean";
  declare readonly options: Options<O, BooleanOptions>;

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

  protected _parseValue(value: unknown, ctx: ParseContext, o: Resolved<BooleanOptions>): InternalResult<boolean> {
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
    if (!value && disallowsFalse(o.required)) {
      return fail([{ path: ctx.path, type: "error", code: "required", key: "boolean.required", params: {} }]);
    }
    return ok(value);
  }
}

export function boolean<const O extends BooleanOptions = {}>(options: O & BooleanOptions = {} as O): BooleanSchema<O> {
  return new BooleanSchema(options);
}

export interface DateOptions extends CommonOptions<Temporal.PlainDate> {
  readonly min?: Dynamic<Temporal.PlainDate>;
  readonly max?: Dynamic<Temporal.PlainDate>;
}

export class DateSchema<const O extends DateOptions = {}> extends ConfigurableSchema<Temporal.PlainDate, O> {
  readonly typeName = "date";
  declare readonly options: Options<O, DateOptions>;

  protected _preprocess(value: unknown): unknown {
    if (typeof value !== "string") return value;
    return parseDate(value.trim()) ?? value;
  }

  protected _parseValue(
    value: unknown,
    ctx: ParseContext,
    o: Resolved<DateOptions>,
  ): InternalResult<Temporal.PlainDate> {
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

export function date<const O extends DateOptions = {}>(options: O & DateOptions = {} as O): DateSchema<O> {
  return new DateSchema(options);
}

export interface DateTimeOptions extends CommonOptions<Temporal.ZonedDateTime> {
  readonly min?: Dynamic<Temporal.ZonedDateTime>;
  readonly max?: Dynamic<Temporal.ZonedDateTime>;
  readonly timeZone?: string;
}

export class DateTimeSchema<const O extends DateTimeOptions = {}> extends ConfigurableSchema<
  Temporal.ZonedDateTime,
  O
> {
  readonly typeName = "datetime";
  declare readonly options: Options<O, DateTimeOptions>;

  constructor(options: O & DateTimeOptions) {
    super(options);
    if (options.timeZone != null) assertTimeZone(options.timeZone);
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

  protected _parseValue(
    value: unknown,
    ctx: ParseContext,
    o: Resolved<DateTimeOptions>,
  ): InternalResult<Temporal.ZonedDateTime> {
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

export function datetime<const O extends DateTimeOptions = {}>(
  options: O & DateTimeOptions = {} as O,
): DateTimeSchema<O> {
  return new DateTimeSchema(options);
}

export interface TimeOptions extends CommonOptions<Temporal.PlainTime> {
  readonly min?: Dynamic<Temporal.PlainTime>;
  readonly max?: Dynamic<Temporal.PlainTime>;
}

export class TimeSchema<const O extends TimeOptions = {}> extends ConfigurableSchema<Temporal.PlainTime, O> {
  readonly typeName = "time";
  declare readonly options: Options<O, TimeOptions>;

  protected _preprocess(value: unknown): unknown {
    if (typeof value !== "string") return value;
    return parseTime(value.trim()) ?? value;
  }

  protected _parseValue(
    value: unknown,
    ctx: ParseContext,
    o: Resolved<TimeOptions>,
  ): InternalResult<Temporal.PlainTime> {
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

export function time<const O extends TimeOptions = {}>(options: O & TimeOptions = {} as O): TimeSchema<O> {
  return new TimeSchema(options);
}

type Literal = string | number | boolean;

export class LiteralSchema<T extends Literal, const O extends CommonOptions<T> = {}> extends ConfigurableSchema<T, O> {
  readonly typeName = "literal";
  private readonly literalValue: T;

  constructor(literalValue: T, options: O & CommonOptions<T>) {
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

export function literal<T extends Literal, const O extends CommonOptions<T> = {}>(
  value: T,
  options: O & CommonOptions<T> = {} as O,
): LiteralSchema<T, O> {
  return new LiteralSchema(value, options);
}

export class AnySchema<const O extends CommonOptions<any> = {}> extends ConfigurableSchema<any, O> {
  readonly typeName = "any";

  protected _parseValue(value: unknown): InternalResult<any> {
    return ok(value);
  }
}

export function any<const O extends CommonOptions<any> = {}>(options: O & CommonOptions<any> = {} as O): AnySchema<O> {
  return new AnySchema(options);
}

export class UnknownSchema<const O extends CommonOptions<unknown> = {}> extends ConfigurableSchema<unknown, O> {
  readonly typeName = "unknown";

  protected _parseValue(value: unknown): InternalResult<unknown> {
    return ok(value);
  }
}

export function unknown<const O extends CommonOptions<unknown> = {}>(
  options: O & CommonOptions<unknown> = {} as O,
): UnknownSchema<O> {
  return new UnknownSchema(options);
}
