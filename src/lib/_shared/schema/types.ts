export type PathSegment = string | number;

export type IssueSeverity = "error" | "warning" | "info";

export type Issue = {
  readonly path: PathSegment[];
  readonly type: IssueSeverity;
  readonly code: string;
  readonly key: string;
  readonly params: Record<string, unknown>;
};

/**
 * パース中の項目の位置と、動的な制約を決めるための情報。
 * - path: ルートからの自分の絶対パス
 * - values: ルートの入力（パース前の生の値）で、ルートがオブジェクトでなければ空。
 * - data: 呼び出し側が parse() に渡した付加情報。
 */
export type ParseContext = {
  readonly path: PathSegment[];
  readonly values: Readonly<Record<string, unknown>>;
  readonly data: Readonly<Record<string, unknown>>;
};

export type Dynamic<T> = T | ((ctx: ParseContext) => T | undefined);

export function typeOf(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}
