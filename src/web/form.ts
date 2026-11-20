import {
  BooleanSchema,
  ConfigurableSchema,
  DateSchema,
  DateTimeSchema,
  TimeSchema,
  disallowsFalse,
  formatIssue,
  isRequired,
  jaFormMessages,
  NumberSchema,
  StringSchema,
  walk,
  type CommonOptions,
  type Dynamic,
  type InferShape,
  type Issue,
  type MessageDictionary,
  type ObjectSchema,
  type RequiredOption,
  type Shape,
} from "../lib/schema/index.ts";
import { toDateTimeInputValue, toTimeInputValue } from "../lib/date.ts";
import { CSRF_FIELD_NAME } from "./csrf.ts";
import type { HtmlElements } from "./html-attributes.ts";
import { HttpError } from "./http-error.ts";
import { slot } from "./slot.ts";

/**
 * readForm() の上限の既定値
 * ファイルを受け取るフォームは options.maxBytes で広げる。
 */
export const DEFAULT_MAX_BODY_BYTES = 1024 * 1024;

const FORM_TYPE = /^(?:application\/x-www-form-urlencoded|multipart\/form-data)\b/i;

export const formSlot = slot<FormData>("form");

export type ReadFormOptions = {
  readonly maxBytes?: number;
};

async function readBody(req: Request, maxBytes: number): Promise<Uint8Array> {
  if (req.body == null) return new Uint8Array(0);
  const chunks: Uint8Array[] = [];
  let size = 0;
  // write() で投げると pipeTo() がその例外で失敗し、読み込みも中断される。
  await req.body.pipeTo(
    new WritableStream<Uint8Array>({
      write(chunk) {
        size += chunk.byteLength;
        if (size > maxBytes) {
          throw new HttpError(413, "リクエストボディが上限を超えています。");
        }
        chunks.push(chunk);
      },
    }),
  );
  return Buffer.concat(chunks);
}

export async function readForm(req: Request, options: ReadFormOptions = {}): Promise<FormData> {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BODY_BYTES;
  const contentType = req.headers.get("content-type") ?? "";
  if (!FORM_TYPE.test(contentType)) {
    throw new HttpError(415, `フォームではないContent-Typeです: ${contentType}`);
  }
  if (Number(req.headers.get("content-length")) > maxBytes) {
    throw new HttpError(413, "リクエストボディが上限を超えています。");
  }
  const body = await readBody(req, maxBytes);
  try {
    return await new Response(body, { headers: { "content-type": contentType } }).formData();
  } catch (err) {
    throw new HttpError(400, "フォームを解析できません。", { cause: err });
  }
}

/** 項目名ごとの文言。項目に紐づかないもの（objectのrefineなど）はキー""に入る。 */
export type FormErrors = Readonly<Record<string, readonly string[]>>;
export type FormValues = Readonly<Record<string, string>>;

export type FormResult<T> =
  | { readonly ok: true; readonly data: T; readonly warnings: readonly Issue[] }
  | {
      readonly ok: false;
      readonly errors: FormErrors;
      readonly values: FormValues;
      readonly warnings: readonly Issue[];
    };

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

export type ValidateFormOptions = {
  readonly messages?: MessageDictionary;
  /**
   * 動的な制約と refine に ctx.data として渡す。
   */
  readonly data?: Readonly<Record<string, unknown>> | undefined;
};

export function validateForm<S extends Shape, O extends CommonOptions<InferShape<S>>>(
  schema: ObjectSchema<S, O>,
  form: FormData,
  options: ValidateFormOptions = {},
): FormResult<InferShape<S>> {
  const messages = options.messages ?? jaFormMessages;
  const input = formToObject(schema, form);
  const result = schema.safeParse(input, { data: options.data });
  if (result.success) {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- 入力は常にオブジェクトのためundefined/nullにはならない。
    return { ok: true, data: result.data as InferShape<S>, warnings: result.issues ?? [] };
  }
  const errors: Record<string, string[]> = {};
  const warnings: Issue[] = [];
  for (const issue of result.error.issues) {
    if (issue.type !== "error") {
      warnings.push(issue);
      continue;
    }
    // pathはスキーマのshapeのキーであるため、入力由来のキーは入らない。
    (errors[issue.path.join(".")] ??= []).push(formatIssue(issue, messages));
  }
  const values: Record<string, string> = {};
  for (const key of Object.keys(schema.shape)) {
    const value = input[key];
    if (typeof value === "string") values[key] = value;
  }
  return { ok: false, errors, values, warnings };
}

export type InputAttributes = Pick<
  HtmlElements["input"],
  "type" | "required" | "minlength" | "maxlength" | "min" | "max" | "step"
>;

// 動的な制約はHTML属性にしない。描画時の値で付けた属性は、条件側の入力が変わっても残り、
// JSが無効だと正しい入力を送信できなくなるため。動的な制約はサーバーとクライアント検証スクリプトだけが見る。
function staticValue<T>(value: Dynamic<T> | undefined): T | undefined {
  return typeof value === "function" ? undefined : value;
}

function requiredAttribute(required: Dynamic<RequiredOption> | undefined): Pick<InputAttributes, "required"> {
  return isRequired(staticValue(required)) ? { required: true } : {};
}

export function inputAttributes<S extends Shape, O extends CommonOptions<InferShape<S>>>(
  schema: ObjectSchema<S, O>,
  name: keyof S & string,
): InputAttributes {
  const field = schema.shape[name];
  if (field == null) {
    throw new Error(`スキーマに項目がありません: ${name}`);
  }
  if (field instanceof StringSchema) {
    const o = field.options;
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
    const o = field.options;
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
    const o = field.options;
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
    const o = field.options;
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
    const o = field.options;
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
    // チェックボックスのrequiredは「チェック済み」の意味なので、falseも拒否する指定のときだけ付ける。
    return disallowsFalse(staticValue(field.options.required)) ? { required: true } : {};
  }
  if (field instanceof ConfigurableSchema) {
    return requiredAttribute(field.options.required);
  }
  return {};
}
