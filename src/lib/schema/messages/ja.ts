import type { MessageDictionary } from "../types.ts";

const invalidType = (p: Record<string, unknown>) =>
  `${p.expected} が期待されていましたが、${p.received} を受け取りました`;
const required = () => "値が必要です";
const invalidValue = () => "無効な値です";

export const jaMessages: MessageDictionary = {
  "string.required": required,
  "string.custom": invalidValue,
  "string.invalid_type": invalidType,
  "string.length": (p) => `文字列は ${p.length} 文字である必要があります`,
  "string.min": (p) => `文字列は ${p.min} 文字以上である必要があります`,
  "string.max": (p) => `文字列は ${p.max} 文字以下である必要があります`,
  "string.pattern": () => "形式が正しくありません",
  "string.email": () => "メールアドレスの形式が正しくありません",
  "string.tel": () => "電話番号の形式が正しくありません",
  "string.url": () => "URLの形式が正しくありません",

  "number.required": required,
  "number.custom": invalidValue,
  "number.invalid_type": invalidType,
  "number.int": () => "数値は整数である必要があります",
  "number.decimals": (p) => `数値の小数点以下は ${p.decimals} 桁までである必要があります`,
  "number.min": (p) => `数値は ${p.min} 以上である必要があります`,
  "number.max": (p) => `数値は ${p.max} 以下である必要があります`,
  "number.positive": () => "数値は正の値である必要があります",
  "number.negative": () => "数値は負の値である必要があります",
  "number.nonnegative": () => "数値は 0 以上である必要があります",

  "boolean.required": required,
  "boolean.custom": invalidValue,
  "boolean.invalid_type": invalidType,

  "date.required": required,
  "date.custom": invalidValue,
  "date.invalid_type": invalidType,
  "date.min": (p) => `日付は ${p.min} 以降である必要があります`,
  "date.max": (p) => `日付は ${p.max} 以前である必要があります`,

  "datetime.required": required,
  "datetime.custom": invalidValue,
  "datetime.invalid_type": invalidType,
  "datetime.min": (p) => `日時は ${p.min} 以降である必要があります`,
  "datetime.max": (p) => `日時は ${p.max} 以前である必要があります`,

  "time.required": required,
  "time.custom": invalidValue,
  "time.invalid_type": invalidType,
  "time.min": (p) => `時刻は ${p.min} 以降である必要があります`,
  "time.max": (p) => `時刻は ${p.max} 以前である必要があります`,

  "literal.required": required,
  "literal.custom": invalidValue,
  "literal.invalid_literal": (p) => `${JSON.stringify(p.expected)}のいずれかを入力してください`,

  "any.required": required,
  "any.custom": invalidValue,

  "unknown.required": required,
  "unknown.custom": invalidValue,

  "object.required": required,
  "object.custom": invalidValue,
  "object.invalid_type": invalidType,
  "object.unknown_key": (p) => `定義にないキー: ${p.key}`,

  "array.required": required,
  "array.custom": invalidValue,
  "array.invalid_type": invalidType,
  "array.length": (p) => `配列は ${p.length} 個の要素を持つ必要があります`,
  "array.min": (p) => `配列は ${p.min} 個以上の要素を持つ必要があります`,
  "array.max": (p) => `配列は ${p.max} 個以下の要素を持つ必要があります`,

  "record.required": required,
  "record.custom": invalidValue,
  "record.invalid_type": invalidType,
  "record.length": (p) => `オブジェクトは ${p.length} 個のキーを持つ必要があります`,
  "record.min": (p) => `オブジェクトは ${p.min} 個以上のキーを持つ必要があります`,
  "record.max": (p) => `オブジェクトは ${p.max} 個以下のキーを持つ必要があります`,

  "tuple.required": required,
  "tuple.custom": invalidValue,
  "tuple.invalid_type": invalidType,
  "tuple.length": (p) => `タプルは ${p.length} 個の要素を持つ必要があります`,

  "union.required": required,
  "union.custom": invalidValue,
  "union.invalid_union": () => "入力がユニオンのいずれの選択肢にも一致しません",

  "intersection.required": required,
  "intersection.custom": invalidValue,

  "enum.required": required,
  "enum.custom": invalidValue,
  "enum.invalid_enum_value": (p) =>
    `${(p.options as unknown[]).map((v) => JSON.stringify(v)).join(", ")} のいずれかが期待されていましたが、${JSON.stringify(p.received)} を受け取りました`,
};
