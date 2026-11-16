export type PathSegment = string | number;

export type IssueSeverity = "error" | "warning" | "info";

export type Issue = {
  readonly path: PathSegment[];
  readonly type: IssueSeverity;
  readonly code: string;
  readonly key: string;
  readonly params: Record<string, unknown>;
};

export type ParseContext = {
  readonly path: PathSegment[];
};

export type MessageDictionary = Record<string, (params: Record<string, unknown>) => string>;

export function typeOf(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}
