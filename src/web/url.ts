import type { RoutePath } from "../routes.gen.ts";

type ParamNames<P extends string> = P extends `${string}[${infer Name}]${infer Rest}`
  ? Name | ParamNames<Rest>
  : never;

type QueryValue = string | number | boolean;
export type Query = Record<string, QueryValue | readonly QueryValue[] | null | undefined>;

export type PathOptions<P extends RoutePath> = [ParamNames<P>] extends [never]
  ? [options?: { query?: Query }]
  : [options: { params: Record<ParamNames<P>, string | number>; query?: Query }];

/** path() で組み立てたアプリ内のパス。Location ヘッダーにはこの型の値だけを使う。 */
export type AppPath = string & { readonly __brand: "AppPath" };

/**
 * ルートのパターンにパラメータを埋め込み、クエリを付けたパスを返す。
 * 区切りごとにエンコードし、クエリの null・undefined は省き、配列は同じキーで繰り返す。
 *
 *   path("/user/[id]", { params: { id: 123 }, query: { tab: "a" } })  → "/user/123?tab=a"
 *
 * パラメータが空文字列・`.`・`..` だと同じルートに照合されない URL になるため、例外を投げる。
 */
export function path<P extends RoutePath>(route: P, ...[options]: PathOptions<P>): AppPath {
  const { params = {}, query } = (options ?? {}) as {
    params?: Record<string, string | number>;
    query?: Query;
  };
  const pathname = route === "/" ? "/" : "/" + route.slice(1).split("/").map((segment) => {
    const name = segment.match(/^\[(\w+)\]$/)?.[1];
    if (name === undefined) return encodeURIComponent(segment);
    const value = params[name] === undefined ? "" : String(params[name]);
    if (value === "" || value === "." || value === "..") {
      throw new Error(`${route}: パラメータ "${name}" に "${value}" は使えません`);
    }
    return encodeURIComponent(value);
  }).join("/");

  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === null || value === undefined) continue;
    for (const v of Array.isArray(value) ? value : [value]) search.append(key, String(v));
  }
  const qs = search.toString();
  return (qs === "" ? pathname : `${pathname}?${qs}`) as AppPath;
}

/**
 * 相対パスの Location でリダイレクトする。
 * req.url から絶対 URL を作ると Host ヘッダーの値がリダイレクト先に入るため、相対パスにしている。
 */
export function redirect(to: AppPath, status: 301 | 302 | 303 | 307 | 308 = 302): Response {
  return new Response(null, { status, headers: { location: to } });
}
