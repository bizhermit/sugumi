import { any, boolean, date, datetime, literal, number, string, time, unknown } from "./primitives.ts";
import { object } from "./object.ts";
import { array } from "./array.ts";
import { record } from "./record.ts";
import { tuple } from "./tuple.ts";
import { union } from "./union.ts";
import { intersection } from "./intersection.ts";
import { enumType } from "./enum.ts";
import { lazy } from "./lazy.ts";

export const s = {
  string,
  number,
  boolean,
  date,
  datetime,
  time,
  literal,
  any,
  unknown,
  object,
  array,
  record,
  tuple,
  union,
  intersection,
  enum: enumType,
  lazy,
};

export { Schema, ConfigurableSchema, isRequired, allowsNull } from "./schema.ts";
export type { Infer, CommonOptions, RequiredOption, Nullish, RefineIssue } from "./schema.ts";
export { walk } from "./introspect.ts";
export type { FieldInfo, FieldPath } from "./introspect.ts";
export { ObjectSchema } from "./object.ts";
export type { Shape, InferShape } from "./object.ts";
export { ArraySchema } from "./array.ts";
export type { ArrayOptions } from "./array.ts";
export { RecordSchema } from "./record.ts";
export type { RecordOptions } from "./record.ts";
export { TupleSchema } from "./tuple.ts";
export { UnionSchema } from "./union.ts";
export { IntersectionSchema } from "./intersection.ts";
export { EnumSchema } from "./enum.ts";
export { LazySchema } from "./lazy.ts";
export {
  StringSchema,
  NumberSchema,
  BooleanSchema,
  DateSchema,
  DateTimeSchema,
  TimeSchema,
  LiteralSchema,
  AnySchema,
  UnknownSchema,
} from "./primitives.ts";
export type {
  StringOptions,
  StringType,
  NumberOptions,
  BooleanRequiredOption,
  DateOptions,
  DateTimeOptions,
  TimeOptions,
} from "./primitives.ts";
export { SchemaError, hasErrorSeverity } from "./error.ts";
export type { ParseResult, SuccessResult, FailureResult, InternalResult, FailureIssues } from "./error.ts";
export type { Issue, IssueSeverity } from "./types.ts";
export {
  formatIssue,
  formatIssues,
  resolveLabel,
  resolveLabels,
  setDefaultMessages,
  getDefaultMessages,
  enMessages,
  jaMessages,
  jaFormMessages,
} from "./message.ts";
export type { MessageDictionary } from "./message.ts";
