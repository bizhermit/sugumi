import type { InternalResult } from "./error.ts";
import { Schema } from "./schema.ts";
import type { ParseContext } from "./types.ts";

export class LazySchema<T> extends Schema<T> {
  private readonly getter: () => Schema<T>;
  private resolved: Schema<T> | undefined;

  constructor(getter: () => Schema<T>) {
    super();
    this.getter = getter;
  }

  get schema(): Schema<T> {
    this.resolved ??= this.getter();
    return this.resolved;
  }

  _parse(input: unknown, ctx: ParseContext): InternalResult<T> {
    return this.schema._parse(input, ctx);
  }
}

export function lazy<T>(getter: () => Schema<T>): LazySchema<T> {
  return new LazySchema(getter);
}
