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
 * path は自分の位置。values はルートの入力（パース前の生の値）で、ルートがオブジェクトでなければ空。
 * data は呼び出し側が parse() に渡した付加情報。
 */
export type ParseContext = {
  readonly path: PathSegment[];
  readonly values: Readonly<Record<string, unknown>>;
  readonly data: Readonly<Record<string, unknown>>;
};

/**
 * 他の入力値や付加情報で決まる制約。関数が undefined を返したときは、その制約を掛けない。
 */
export type Dynamic<T> = T | ((ctx: ParseContext) => T | undefined);

export type MessageDictionary = Record<string, (params: Record<string, unknown>) => string>;

export function typeOf(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}
