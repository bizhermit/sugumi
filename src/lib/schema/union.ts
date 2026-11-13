import { fail, type InternalResult } from "./error.ts";
import { ConfigurableSchema, Schema, type CommonOptions, type RequiredOption } from "./schema.ts";
import type { Issue, ParseContext } from "./types.ts";

type Members = readonly [Schema<any>, ...Schema<any>[]];
type UnionOutput<T extends Members> = T[number]["_output"];

export class UnionSchema<T extends Members, const R extends RequiredOption = false> extends ConfigurableSchema<
  UnionOutput<T>,
  R
> {
  readonly typeName = "union";
  readonly members: T;

  constructor(members: T, options: CommonOptions<UnionOutput<T>, R> = {}) {
    super(options);
    this.members = members;
  }

  acceptsEmptyString(): boolean {
    return this.members.some((member) => member instanceof ConfigurableSchema && member.acceptsEmptyString());
  }

  protected _parseValue(value: unknown, ctx: ParseContext): InternalResult<UnionOutput<T>> {
    const issues: Issue[] = [];

    for (const member of this.members) {
      const result = member._parse(value, ctx);
      if (result.success) return result as InternalResult<UnionOutput<T>>;
      issues.push(...result.issues);
    }

    return fail([
      { path: ctx.path, type: "error", code: "invalid_union", key: "union.invalid_union", params: {} },
      ...issues,
    ]);
  }
}

export function union<T extends Members, const R extends RequiredOption = false>(
  members: T,
  options: CommonOptions<UnionOutput<T>, R> = {},
): UnionSchema<T, R> {
  return new UnionSchema(members, options);
}
