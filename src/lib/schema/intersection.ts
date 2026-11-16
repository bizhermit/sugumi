import type { InternalResult } from "./error.ts";
import { ConfigurableSchema, type CommonOptions, type RequiredOption } from "./schema.ts";
import { ObjectSchema, type Shape } from "./object.ts";
import type { ParseContext } from "./types.ts";

type Members = readonly [ObjectSchema<any, true>, ...ObjectSchema<any, true>[]];
type UnionToIntersection<U> = (U extends any ? (x: U) => void : never) extends (x: infer I) => void ? I : never;
type IntersectionOutput<T extends Members> = UnionToIntersection<T[number]["_output"]>;

export class IntersectionSchema<T extends Members, const R extends RequiredOption = false> extends ConfigurableSchema<
  IntersectionOutput<T>,
  R
> {
  readonly typeName = "intersection";
  readonly members: T;
  private readonly merged: ObjectSchema<Shape, true>;

  readonly options: CommonOptions<IntersectionOutput<T>, R>;

  constructor(members: T, options: CommonOptions<IntersectionOutput<T>, R> = {}) {
    super();
    this.options = options;
    this.members = members;
    this.merged = new ObjectSchema(Object.assign({}, ...members.map((member) => member.shape)) as Shape, {
      required: true,
    });
  }

  protected _parseValue(value: unknown, ctx: ParseContext): InternalResult<IntersectionOutput<T>> {
    return this.merged._parse(value, ctx) as InternalResult<IntersectionOutput<T>>;
  }
}

export function intersection<T extends Members, const R extends RequiredOption = false>(
  members: T,
  options: CommonOptions<IntersectionOutput<T>, R> = {},
): IntersectionSchema<T, R> {
  return new IntersectionSchema(members, options);
}
