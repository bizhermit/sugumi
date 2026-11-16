import type { MessageDictionary } from "../types.ts";

const subject = (p: Record<string, unknown>) => (typeof p.label === "string" ? p.label : "値");

const enterValue = (p: Record<string, unknown>) => `${subject(p)}を入力してください`;
const enterCorrectValue = (p: Record<string, unknown>) => `${subject(p)}を正しい値で入力してください`;
const enterCorrectFormat = (p: Record<string, unknown>) => `${subject(p)}は正しい形式で入力してください`;

export const jaFormMessages: MessageDictionary = {
  "string.required": enterValue,
  "string.custom": enterCorrectValue,
  "string.invalid_type": enterCorrectFormat,
  "string.length": (p) => `${subject(p)}は${p.length}文字で入力してください`,
  "string.min": (p) => `${subject(p)}は${p.min}文字以上で入力してください`,
  "string.max": (p) => `${subject(p)}は${p.max}文字以内で入力してください`,
  "string.pattern": enterCorrectFormat,
  "string.email": (p) => `${subject(p)}はメールアドレスの形式で入力してください`,
  "string.tel": (p) => `${subject(p)}は電話番号の形式で入力してください`,
  "string.url": (p) => `${subject(p)}はURLの形式で入力してください`,

  "number.required": enterValue,
  "number.custom": enterCorrectValue,
  "number.invalid_type": (p) => `${subject(p)}は数値で入力してください`,
  "number.int": (p) => `${subject(p)}は整数で入力してください`,
  "number.decimals": (p) => `${subject(p)}は小数点以下${p.decimals}桁までで入力してください`,
  "number.min": (p) => `${subject(p)}は${p.min}以上で入力してください`,
  "number.max": (p) => `${subject(p)}は${p.max}以下で入力してください`,
  "number.positive": (p) => `${subject(p)}は正の数で入力してください`,
  "number.negative": (p) => `${subject(p)}は負の数で入力してください`,
  "number.nonnegative": (p) => `${subject(p)}は0以上で入力してください`,

  "boolean.required": enterValue,
  "boolean.custom": enterCorrectValue,
  "boolean.invalid_type": enterCorrectFormat,

  "date.required": enterValue,
  "date.custom": enterCorrectValue,
  "date.invalid_type": enterCorrectFormat,
  "date.min": (p) => `${subject(p)}は${p.min}以降の日付で入力してください`,
  "date.max": (p) => `${subject(p)}は${p.max}以前の日付で入力してください`,

  "datetime.required": enterValue,
  "datetime.custom": enterCorrectValue,
  "datetime.invalid_type": enterCorrectFormat,
  "datetime.min": (p) => `${subject(p)}は${p.min}以降の日時で入力してください`,
  "datetime.max": (p) => `${subject(p)}は${p.max}以前の日時で入力してください`,

  "time.required": enterValue,
  "time.custom": enterCorrectValue,
  "time.invalid_type": enterCorrectFormat,
  "time.min": (p) => `${subject(p)}は${p.min}以降の時刻で入力してください`,
  "time.max": (p) => `${subject(p)}は${p.max}以前の時刻で入力してください`,

  "literal.required": enterValue,
  "literal.custom": enterCorrectValue,
  "literal.invalid_literal": enterCorrectValue,

  "any.required": enterValue,
  "any.custom": enterCorrectValue,

  "unknown.required": enterValue,
  "unknown.custom": enterCorrectValue,

  "object.required": enterValue,
  "object.custom": enterCorrectValue,
  "object.invalid_type": enterCorrectFormat,
  "object.unknown_key": (p) => `${p.key}は入力項目にありません`,

  "array.required": enterValue,
  "array.custom": enterCorrectValue,
  "array.invalid_type": enterCorrectFormat,
  "array.length": (p) => `${subject(p)}は${p.length}件で入力してください`,
  "array.min": (p) => `${subject(p)}は${p.min}件以上で入力してください`,
  "array.max": (p) => `${subject(p)}は${p.max}件以内で入力してください`,

  "record.required": enterValue,
  "record.custom": enterCorrectValue,
  "record.invalid_type": enterCorrectFormat,
  "record.length": (p) => `${subject(p)}は${p.length}件で入力してください`,
  "record.min": (p) => `${subject(p)}は${p.min}件以上で入力してください`,
  "record.max": (p) => `${subject(p)}は${p.max}件以内で入力してください`,

  "tuple.required": enterValue,
  "tuple.custom": enterCorrectValue,
  "tuple.invalid_type": enterCorrectFormat,
  "tuple.length": (p) => `${subject(p)}は${p.length}件で入力してください`,

  "union.required": enterValue,
  "union.custom": enterCorrectValue,
  "union.invalid_union": enterCorrectValue,

  "intersection.required": enterValue,
  "intersection.custom": enterCorrectValue,

  "enum.required": enterValue,
  "enum.custom": enterCorrectValue,
  "enum.invalid_enum_value": (p) => `${subject(p)}は正しい選択肢で入力してください`,
};
