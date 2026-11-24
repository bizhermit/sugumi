import { ArraySchema } from "./array.ts";
import { IntersectionSchema } from "./intersection.ts";
import { LazySchema } from "./lazy.ts";
import { ObjectSchema } from "./object.ts";
import { RecordSchema } from "./record.ts";
import { ConfigurableSchema, Schema, type CommonOptions } from "./schema.ts";
import { TupleSchema } from "./tuple.ts";

export type FieldPath = ReadonlyArray<string | number>;

export interface FieldInfo {
  readonly path: FieldPath;
  readonly typeName: string;
  readonly options: Readonly<CommonOptions<unknown>>;
}

export function walk(
  schema: Schema<any>,
  path: FieldPath = [],
  visited: ReadonlySet<Schema<any>> = new Set([schema]),
): FieldInfo[] {
  if (schema instanceof ObjectSchema) {
    return Object.keys(schema.shape).flatMap((key) => walk(schema.shape[key], [...path, key], visited));
  }
  if (schema instanceof IntersectionSchema) {
    return schema.members.flatMap((member: Schema<any>) => walk(member, path, visited));
  }
  if (schema instanceof ArraySchema || schema instanceof RecordSchema) {
    return [fieldInfo(schema, path), ...walk(schema.element, [...path, 0], visited)];
  }
  if (schema instanceof TupleSchema) {
    return [
      fieldInfo(schema, path),
      ...schema.elements.flatMap((element: Schema<any>, index: number) => walk(element, [...path, index], visited)),
    ];
  }
  if (schema instanceof LazySchema) {
    const resolved = schema.schema;
    if (visited.has(resolved)) return [];
    return walk(resolved, path, new Set(visited).add(resolved));
  }
  if (schema instanceof ConfigurableSchema) {
    return [fieldInfo(schema, path)];
  }
  return [];
}

function fieldInfo(schema: ConfigurableSchema<any, any>, path: FieldPath): FieldInfo {
  return { path, typeName: schema.typeName, options: schema.options };
}
