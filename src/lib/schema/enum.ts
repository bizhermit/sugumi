import { fail, ok, type InternalResult } from "./error.ts";
import { ConfigurableSchema, type CommonOptions, type RequiredOption } from "./schema.ts";
import type { ParseContext } from "./types.ts";

export class EnumSchema<
  T extends readonly [string, ...string[]],
  const R extends RequiredOption = false,
> extends ConfigurableSchema<T[number], R> {
  readonly typeName = "enum";
  readonly values: T;

  readonly options: CommonOptions<T[number], R>;

  constructor(values: T, options: CommonOptions<T[number], R> = {}) {
    super();
    this.options = options;
    this.values = values;
  }

  acceptsEmptyString(): boolean {
    // 選択肢に""があるときだけ空文字を値として受け付ける。
    return this.values.includes("");
  }

  protected _parseValue(value: unknown, ctx: ParseContext): InternalResult<T[number]> {
    if (typeof value !== "string" || !this.values.includes(value)) {
      return fail([
        {
          path: ctx.path,
          type: "error",
          code: "invalid_enum_value",
          key: "enum.invalid_enum_value",
          params: { options: this.values, received: value },
        },
      ]);
    }
    return ok(value as T[number]);
  }
}

export function enumType<T extends readonly [string, ...string[]], const R extends RequiredOption = false>(
  values: T,
  options: CommonOptions<T[number], R> = {},
): EnumSchema<T, R> {
  return new EnumSchema(values, options);
}
