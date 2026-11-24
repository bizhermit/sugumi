import type { InternalResult } from "./error.ts";
import { ConfigurableSchema, type CommonOptions, type Options } from "./schema.ts";
import { ObjectSchema, type Shape } from "./object.ts";
import type { ParseContext } from "./types.ts";

type Members = readonly [
  ObjectSchema<any, { readonly required: true }>,
  ...ObjectSchema<any, { readonly required: true }>[],
];
type UnionToIntersection<U> = (U extends any ? (x: U) => void : never) extends (x: infer I) => void ? I : never;
type IntersectionOutput<T extends Members> = UnionToIntersection<T[number]["_output"]>;

export class IntersectionSchema<T extends Members, const O extends CommonOptions<any> = {}> extends ConfigurableSchema<
  IntersectionOutput<T>,
  O
> {
  readonly typeName = "intersection";
  readonly members: T;
  private readonly merged: ObjectSchema<Shape, { readonly required: true }>;
  declare readonly options: Options<O, CommonOptions<IntersectionOutput<T>>>;

  constructor(members: T, options: O & CommonOptions<IntersectionOutput<T>>) {
    super(options);
    this.members = members;
    this.merged = new ObjectSchema(Object.assign({}, ...members.map((member) => member.shape)) as Shape, {
      required: true,
    });
  }

  protected _parseValue(value: unknown, ctx: ParseContext): InternalResult<IntersectionOutput<T>> {
    return this.merged._parse(value, ctx) as InternalResult<IntersectionOutput<T>>;
  }
}

export function intersection<T extends Members, const O extends CommonOptions<any> = {}>(
  members: T,
  options: O & CommonOptions<IntersectionOutput<T>> = {} as O,
): IntersectionSchema<T, O> {
  return new IntersectionSchema(members, options);
}
