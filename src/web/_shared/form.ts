import { walk } from "../../lib/_shared/schema/introspect.ts";
import type { InferShape, ObjectSchema, Shape } from "../../lib/_shared/schema/object.ts";
import {
  BooleanSchema,
  DateSchema,
  DateTimeSchema,
  TimeSchema,
  disallowsFalse,
  NumberSchema,
  StringSchema,
} from "../../lib/_shared/schema/primitives.ts";
import {
  ConfigurableSchema,
  isRequired,
  type CommonOptions,
  type ParseOptions,
  type RequiredOption,
} from "../../lib/_shared/schema/schema.ts";
import type { Dynamic, Issue, ParseContext } from "../../lib/_shared/schema/types.ts";
import { toDateTimeInputValue, toTimeInputValue } from "../../lib/_shared/date.ts";
import { CSRF_FIELD_NAME } from "./csrf.ts";
import type { HtmlElements } from "./html-attributes.ts";

export type FormValues = Readonly<Record<string, string>>;

/**
 * - issues: スキーマが出したものを重大度で絞らずにすべて含む
 * - ok: issues に重大度 error のものがないとき true
 * - values: 再表示のための入力値
 */
export type FormResult<T> =
  | { readonly ok: true; readonly data: T; readonly issues: readonly Issue[] }
  | { readonly ok: false; readonly issues: readonly Issue[]; readonly values: FormValues };

function setOwn(target: Record<string, unknown>, key: string, value: unknown): void {
  Object.defineProperty(target, key, { value, enumerable: true, writable: true, configurable: true });
}

export function formToObject<S extends Shape, O extends CommonOptions<InferShape<S>>>(
  schema: ObjectSchema<S, O>,
  form: FormData,
): Record<string, unknown> {
  const arrayKeys = new Set(
    walk(schema)
      .filter((field) => field.path.length === 1 && field.typeName === "array")
      .map((field) => String(field.path[0])),
  );
  const values: Record<string, unknown> = {};
  for (const key of new Set(form.keys())) {
    if (key === CSRF_FIELD_NAME) continue;
    const all = form.getAll(key);
    setOwn(values, key, arrayKeys.has(key) || all.length > 1 ? all : all[0]);
  }
  return values;
}

export function validateForm<S extends Shape, O extends CommonOptions<InferShape<S>>>(
  schema: ObjectSchema<S, O>,
  form: FormData,
  options: ParseOptions = {},
): FormResult<InferShape<S>> {
  const input = formToObject(schema, form);
  const result = schema.safeParse(input, { data: options.data });
  if (result.success) {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- 入力は常にオブジェクトのためundefined/nullにはならない。
    return { ok: true, data: result.data as InferShape<S>, issues: result.issues ?? [] };
  }
  const values: Record<string, string> = {};
  for (const key of Object.keys(schema.shape)) {
    const value = input[key];
    if (typeof value === "string") values[key] = value;
  }
  return { ok: false, issues: result.error.issues, values };
}

export type InputAttributes = Pick<
  HtmlElements["input"],
  "type" | "required" | "minlength" | "maxlength" | "min" | "max" | "step"
>;

/**
 * 動的な制約を決めるための、今のフォームの状態。
 * values は formToObject() の戻り値、data は validateForm() に渡すものと同じ付加情報。
 */
export type InputAttributesCurrent = ParseOptions & Pick<ParseContext, "values">;

// 今の状態がないときは、動的な制約を属性にしない。描画時の値で付けた属性は、条件側の入力が変わっても残り、
// JSが無効だと正しい入力を送信できなくなるため。
function staticValue<T>(value: Dynamic<T> | undefined): T | undefined {
  return typeof value === "function" ? undefined : value;
}

function requiredAttribute(required: Dynamic<RequiredOption> | undefined): Pick<InputAttributes, "required"> {
  return isRequired(staticValue(required)) ? { required: true } : {};
}

export function inputAttributes<S extends Shape, O extends CommonOptions<InferShape<S>>>(
  schema: ObjectSchema<S, O>,
  name: keyof S & string,
  current?: InputAttributesCurrent,
): InputAttributes {
  const field = schema.shape[name];
  if (field == null) {
    throw new Error(`スキーマに項目がありません: ${name}`);
  }
  const ctx: ParseContext | undefined =
    current == null ? undefined : { path: [name], values: current.values, data: current.data ?? {} };
  if (field instanceof StringSchema) {
    const o = ctx == null ? field.options : field.resolve(ctx);
    const minLength = staticValue(o.minLength);
    const maxLength = staticValue(o.maxLength);
    return {
      ...(o.type == null ? {} : { type: o.type }),
      ...requiredAttribute(o.required),
      ...(minLength == null ? {} : { minlength: minLength }),
      ...(maxLength == null ? {} : { maxlength: maxLength }),
    };
  }
  if (field instanceof NumberSchema) {
    const o = ctx == null ? field.options : field.resolve(ctx);
    const min = staticValue(o.min);
    const max = staticValue(o.max);
    return {
      type: "number",
      ...requiredAttribute(o.required),
      ...(min == null ? {} : { min }),
      ...(max == null ? {} : { max }),
      step: o.type === "int" ? 1 : o.decimals == null ? "any" : 10 ** -o.decimals,
    };
  }
  if (field instanceof DateSchema) {
    const o = ctx == null ? field.options : field.resolve(ctx);
    const min = staticValue(o.min);
    const max = staticValue(o.max);
    return {
      type: "date",
      ...requiredAttribute(o.required),
      ...(min == null ? {} : { min: min.toString() }),
      ...(max == null ? {} : { max: max.toString() }),
    };
  }
  if (field instanceof DateTimeSchema) {
    const o = ctx == null ? field.options : field.resolve(ctx);
    const min = staticValue(o.min);
    const max = staticValue(o.max);
    return {
      type: "datetime-local",
      ...requiredAttribute(o.required),
      ...(min == null ? {} : { min: toDateTimeInputValue(min.withTimeZone(field.timeZone)) }),
      ...(max == null ? {} : { max: toDateTimeInputValue(max.withTimeZone(field.timeZone)) }),
    };
  }
  if (field instanceof TimeSchema) {
    const o = ctx == null ? field.options : field.resolve(ctx);
    const min = staticValue(o.min);
    const max = staticValue(o.max);
    return {
      type: "time",
      ...requiredAttribute(o.required),
      ...(min == null ? {} : { min: toTimeInputValue(min) }),
      ...(max == null ? {} : { max: toTimeInputValue(max) }),
    };
  }
  if (field instanceof BooleanSchema) {
    const o = ctx == null ? field.options : field.resolve(ctx);
    // チェックボックスのrequiredは「チェック済み」であるため、falseも拒否する指定のときだけ付ける。
    return disallowsFalse(staticValue(o.required)) ? { required: true } : {};
  }
  if (field instanceof ConfigurableSchema) {
    const o = ctx == null ? field.options : field.resolve(ctx);
    return requiredAttribute(o.required);
  }
  return {};
}
