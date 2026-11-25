import {
  formatIssue,
  jaFormMessages,
  walk,
  type CommonOptions,
  type InferShape,
  type Issue,
  type MessageDictionary,
  type ObjectSchema,
  type ParseOptions,
  type Shape,
} from "../../lib/_shared/schema/index.ts";
import { CSRF_FIELD_NAME } from "./csrf.ts";

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

export type ValidateFormOptions = ParseOptions & {
  readonly messages?: MessageDictionary;
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
