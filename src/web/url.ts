import type { RoutePath } from "../routes.gen.ts";

type ParamNames<P extends string> = P extends `${string}[${infer Name}]${infer Rest}`
  ? Name | ParamNames<Rest>
  : never;

type QueryValue = string | number | boolean;
export type Query = Record<string, QueryValue | readonly QueryValue[] | null | undefined>;

export type PathOptions<P extends RoutePath> = [ParamNames<P>] extends [never]
  ? [options?: { query?: Query }]
  : [options: { params: Record<ParamNames<P>, string | number>; query?: Query }];

/** エンコード済みの区切りか、パラメータの名前。 */
type CompiledRoute = (string | { param: string })[];

// リンクの数に比例して呼ばれるため、パターンの分解とエンコードはルートごとに 1 回だけ行う。
// キーは RoutePath なので、ルートの数より増えない。パラメータのないルートはパスそのものを持つ
const compiledRoutes = new Map<string, string | CompiledRoute>();

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
  let compiled = compiledRoutes.get(route);
  if (compiled === undefined) {
    compiled = compileRoute(route);
    compiledRoutes.set(route, compiled);
  }
  let pathname: string;
  if (typeof compiled === "string") {
    pathname = compiled;
  } else {
    pathname = "";
    for (const part of compiled) {
      if (typeof part === "string") {
        pathname += "/" + part;
        continue;
      }
      const value = params[part.param] === undefined ? "" : String(params[part.param]);
      if (value === "" || value === "." || value === "..") {
        throw new Error(`${route}: パラメータ "${part.param}" に "${value}" は使えません`);
      }
      pathname += "/" + encodeURIComponent(value);
    }
  }

  // クエリのないリンクが多いため、値があるときだけ URLSearchParams を作る
  let search: URLSearchParams | undefined;
  for (const key in query) {
    if (!Object.hasOwn(query, key)) continue;
    const value = query[key];
    if (value === null || value === undefined) continue;
    search ??= new URLSearchParams();
    if (Array.isArray(value)) {
      for (const v of value) search.append(key, String(v));
    } else {
      search.append(key, String(value));
    }
  }
  const qs = search === undefined ? "" : search.toString();
  return (qs === "" ? pathname : `${pathname}?${qs}`) as AppPath;
}

function compileRoute(route: string): string | CompiledRoute {
  if (route === "/") return "/";
  const parts: CompiledRoute = route.slice(1).split("/").map((segment) => {
    const name = segment.match(/^\[(\w+)\]$/)?.[1];
    return name === undefined ? encodeURIComponent(segment) : { param: name };
  });
  return parts.every((p) => typeof p === "string") ? "/" + parts.join("/") : parts;
}

/**
 * 相対パスの Location でリダイレクトする。
 * req.url から絶対 URL を作ると Host ヘッダーの値がリダイレクト先に入るため、相対パスにしている。
 */
export function redirect(to: AppPath, status: 301 | 302 | 303 | 307 | 308 = 302): Response {
  return new Response(null, { status, headers: { location: to } });
}

/**
 * 利用者から受け取ったパス（ログイン後の戻り先など）が、このサイトの中を指すときだけ AppPath にして返す。
 * 別のサイトを指すか、パスとして読めなければ undefined を返す。フラグメントは捨てる。
 */
export function appPathOf(value: string | null): AppPath | undefined {
  if (value === null || !value.startsWith("/")) return undefined;
  // `//evil.example` や `/\evil.example` はブラウザが別のホストとして解釈するため、URL として解析して確かめる
  const base = "http://app.invalid";
  let url: URL;
  try {
    url = new URL(value, base);
  } catch {
    return undefined;
  }
  if (url.origin !== base) return undefined;
  // `/.//evil.example` は正規化すると `//evil.example` になり、Location に入れると別のホストを指す
  if (url.pathname.startsWith("//")) return undefined;
  return (url.pathname + url.search) as AppPath;
}
