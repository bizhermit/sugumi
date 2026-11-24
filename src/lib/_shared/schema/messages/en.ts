import type { MessageDictionary } from "../types.ts";

const invalidType = (p: Record<string, unknown>) => `Expected ${p.expected}, received ${p.received}`;
const required = () => "Required value is missing";
const invalidValue = () => "Invalid value";

export const enMessages: MessageDictionary = {
  "string.required": required,
  "string.custom": invalidValue,
  "string.invalid_type": invalidType,
  "string.length": (p) => `String must be exactly ${p.length} character(s)`,
  "string.min": (p) => `String must contain at least ${p.min} character(s)`,
  "string.max": (p) => `String must contain at most ${p.max} character(s)`,
  "string.pattern": () => "Invalid format",
  "string.email": () => "Invalid email address",
  "string.tel": () => "Invalid phone number",
  "string.url": () => "Invalid URL",

  "number.required": required,
  "number.custom": invalidValue,
  "number.invalid_type": invalidType,
  "number.int": () => "Number must be an integer",
  "number.decimals": (p) => `Number must have at most ${p.decimals} decimal place(s)`,
  "number.min": (p) => `Number must be greater than or equal to ${p.min}`,
  "number.max": (p) => `Number must be less than or equal to ${p.max}`,
  "number.positive": () => "Number must be positive",
  "number.negative": () => "Number must be negative",
  "number.nonnegative": () => "Number must be non-negative",

  "boolean.required": required,
  "boolean.custom": invalidValue,
  "boolean.invalid_type": invalidType,

  "date.required": required,
  "date.custom": invalidValue,
  "date.invalid_type": invalidType,
  "date.min": (p) => `Date must be on or after ${p.min}`,
  "date.max": (p) => `Date must be on or before ${p.max}`,

  "datetime.required": required,
  "datetime.custom": invalidValue,
  "datetime.invalid_type": invalidType,
  "datetime.min": (p) => `Date and time must be on or after ${p.min}`,
  "datetime.max": (p) => `Date and time must be on or before ${p.max}`,

  "time.required": required,
  "time.custom": invalidValue,
  "time.invalid_type": invalidType,
  "time.min": (p) => `Time must be at or after ${p.min}`,
  "time.max": (p) => `Time must be at or before ${p.max}`,

  "literal.required": required,
  "literal.custom": invalidValue,
  "literal.invalid_literal": (p) => `Expected literal value ${JSON.stringify(p.expected)}`,

  "any.required": required,
  "any.custom": invalidValue,

  "unknown.required": required,
  "unknown.custom": invalidValue,

  "object.required": required,
  "object.custom": invalidValue,
  "object.invalid_type": invalidType,
  "object.unknown_key": (p) => `Unknown key "${p.key}" was ignored`,

  "array.required": required,
  "array.custom": invalidValue,
  "array.invalid_type": invalidType,
  "array.length": (p) => `Array must contain exactly ${p.length} element(s)`,
  "array.min": (p) => `Array must contain at least ${p.min} element(s)`,
  "array.max": (p) => `Array must contain at most ${p.max} element(s)`,

  "record.required": required,
  "record.custom": invalidValue,
  "record.invalid_type": invalidType,
  "record.length": (p) => `Record must have exactly ${p.length} key(s)`,
  "record.min": (p) => `Record must have at least ${p.min} key(s)`,
  "record.max": (p) => `Record must have at most ${p.max} key(s)`,

  "tuple.required": required,
  "tuple.custom": invalidValue,
  "tuple.invalid_type": invalidType,
  "tuple.length": (p) => `Tuple must contain exactly ${p.length} element(s)`,

  "union.required": required,
  "union.custom": invalidValue,
  "union.invalid_union": () => "Input does not match any option in the union",

  "intersection.required": required,
  "intersection.custom": invalidValue,

  "enum.required": required,
  "enum.custom": invalidValue,
  "enum.invalid_enum_value": (p) =>
    `Expected one of ${(p.options as unknown[]).map((v) => JSON.stringify(v)).join(", ")}, received ${JSON.stringify(p.received)}`,
};
