import type { RoutePath } from "../routes.gen.ts";

type ParamNames<P extends string> = P extends `${string}[${infer Name}]${infer Rest}`
  ? Name | ParamNames<Rest>
  : never;

type QueryValue = string | number | boolean;
export type Query = Record<string, QueryValue | ReadonlyArray<QueryValue> | null | undefined>;

export type PathOptions<P extends RoutePath> = [ParamNames<P>] extends [never]
  ? [options?: { query?: Query }]
  : [options: { params: Record<ParamNames<P>, string | number>; query?: Query }];

/** エンコード済みの区切りか、パラメータの名前。 */
type CompiledRoute = Array<string | { param: string }>;

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

function compileRoute(route: string) {
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

/**
 * 利用者から受け取った URL を、href・src などに出してよいときだけ返す。
 * http・https の絶対 URL は解析して正規化した値を、`/` で始まる値は appPathOf() の結果を返す。
 * それ以外（`javascript:`・`data:`・相対パス・`//` で始まる値・ユーザー名やパスワードを含む URL など）は undefined を返す。
 */
export function safeUrl(value: string | null | undefined): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (value.startsWith("/")) return appPathOf(value);
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return undefined;
  }
  // 拒むスキームを並べると、未知のスキームや表記の揺れ（大文字、前後の空白や制御文字）を取りこぼすため、許すものだけを並べる
  if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
  // `https://example.com@evil.example/` は evil.example を指すが、example.com へのリンクに見えるため
  if (url.username !== "" || url.password !== "") return undefined;
  // ブラウザと同じ規則で解析した結果を返し、元の文字列が別の意味に解釈される余地をなくす
  return url.href;
}

// HTML の仕様が <input type="email"> の検証に使う形式。RFC 5322 より狭いが、引用符やコメントを含むアドレスを扱わずに済む
// https://html.spec.whatwg.org/multipage/input.html#valid-e-mail-address
const EMAIL =
  /^([a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+)@([a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*)$/;

/**
 * 利用者から受け取ったメールアドレスを、リンクに使える `mailto:` の URL にして返す。
 * 形式が違えば undefined を返す。`mailto:` で始まる値は受け付けない。
 */
export function mailtoUrl(address: string | null | undefined): string | undefined {
  // RFC 5321 の上限。超えるアドレスには送信できない
  if (address === null || address === undefined || address.length > 254) return undefined;
  const match = EMAIL.exec(address);
  if (match === null || match[1].length > 64) return undefined;
  // ローカル部に使える `?`・`#`・`&`・`%` は、mailto: では cc や本文の指定、区切りとして読まれるためエンコードする
  return `mailto:${encodeURIComponent(match[1])}@${match[2]}`;
}

// 区切りは、利用者が書きがちな `-`・空白・括弧だけを認める。先頭の `+` は国番号を表す
const PHONE = /^\+?[0-9() -]+$/;
const PHONE_SEPARATORS = /[() -]/g;

/**
 * 利用者から受け取った電話番号を、リンクに使える `tel:` の URL にして返す。
 * 区切りを除いた数字だけの URL にする（`03-1234-5678` → `tel:0312345678`）。形式が違えば undefined を返す。
 */
export function telUrl(number: string | null | undefined): string | undefined {
  if (number === null || number === undefined || !PHONE.test(number)) return undefined;
  const digits = number.replace(PHONE_SEPARATORS, "");
  // E.164 の上限は国番号を含めて 15 桁。`+` を除いて数える
  const count = digits.startsWith("+") ? digits.length - 1 : digits.length;
  if (count === 0 || count > 15) return undefined;
  return `tel:${digits}`;
}
