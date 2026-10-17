/**
 * src/pages/ のディレクトリを URL に対応させる。ディレクトリにあるメソッドのファイルが、そのメソッドのリクエストを処理する。
 *
 *   src/pages/get.ts             → GET /
 *   src/pages/foo/get.ts         → GET /foo
 *   src/pages/foo/post.ts        → POST /foo
 *   src/pages/user/[id]/get.ts   → GET /user/123（ctx.params.id は "123"）
 *
 * メソッドのファイルは get.ts・post.ts・put.ts・patch.ts・delete.ts で、default export でハンドラを公開する。
 * HEAD は get.ts で処理する。ファイルのないメソッドには、ハンドラを呼ばずに 405 を返す。
 * before.ts があれば、その default export をメソッドのハンドラより前に呼ぶ。Response を返すとそれを応答にし、
 * メソッドのハンドラは呼ばない。before.ts だけがあるディレクトリはルートにならず、例外になる。
 *
 * これら以外のファイルはルートにしないため、ページ専用の部品は同じディレクトリに置ける。
 * `_` や `.` で始まるディレクトリは走査しない。ページの JS・CSS は `_assets/` に置く（assets.ts を参照）。
 * `/assets/` は静的ファイルの配信に使うため、`pages/assets/` は作れない。
 *
 * 静的なルートを動的なルートより優先し、動的なルート同士では前の区切りが固定のものを優先する。
 * パラメータの値はデコード済みで、形式の検証は各ページで行う。`%2F` は区切りにせず値の一部として渡す。
 *
 * `../` で pages 外に届かないよう、リクエストの内容をファイルパスや import の指定子に使わないこと。
 * `/%61dmin` も `/admin` と同じページに照合されるため、アクセス制御は生の pathname ではなく照合結果で判定すること。
 */
import type { Session } from "../lib/auth/session.ts";

export type PageContext = {
  params: Record<string, string>;
  /** ログインしていなければ undefined。 */
  session: Session | undefined;
  /** フォームに埋め込む CSRF トークン。 */
  csrfToken: () => Promise<string>;
  /** 接続元の IP アドレス。リバースプロキシの裏ではプロキシのアドレスになる。 */
  remoteAddress: string | undefined;
};
export type PageHandler = (req: Request, ctx: PageContext) => Response | Promise<Response>;
/** Response を返すとそれを応答にする。undefined を返すとメソッドのハンドラに進む。 */
export type BeforeHandler = (
  req: Request,
  ctx: PageContext,
) => Response | undefined | Promise<Response | undefined>;
/** handler は、メソッドのファイルがなければ undefined。allow は 405 の Allow ヘッダーに使う。 */
export type RouteMatch = {
  handler: PageHandler | undefined;
  allow: string[];
  params: Record<string, string>;
};

export type Segment = { literal: string } | { param: string };
/** relative は src/pages/ からのディレクトリの相対パス（例："foo/"、ルートは ""）。files はルートのファイル名。 */
export type PageDir = { url: URL; relative: string; segments: Segment[]; files: string[] };
type Route = { methods: Map<string, PageHandler>; allow: string[] };
type DynamicRoute = { segments: Segment[]; route: Route };

const PAGES_DIR = new URL("../pages/", import.meta.url);

const METHOD_FILES: Record<string, string> = {
  "get.ts": "GET",
  "post.ts": "POST",
  "put.ts": "PUT",
  "patch.ts": "PATCH",
  "delete.ts": "DELETE",
};
const BEFORE_FILE = "before.ts";

/** ディレクトリ名が不正な場合や、同じ URL に対応するページが複数ある場合は例外を投げる。 */
export async function scanPages(): Promise<PageDir[]> {
  const pages: PageDir[] = [];
  const sources = new Map<string, string>();
  for await (const page of walk(PAGES_DIR, "")) {
    const { relative } = page;
    if (!page.files.some((name) => name in METHOD_FILES)) {
      throw new Error(
        `pages/${relative}${BEFORE_FILE}: 同じディレクトリにメソッドのファイルがありません`,
      );
    }
    const segments = parseSegments(relative);
    // /assets/ は assets.ts が静的ファイルの配信に使う
    if (segments[0] && "literal" in segments[0] && segments[0].literal === "assets") {
      throw new Error(`pages/${relative}: assets はページの URL に使えません`);
    }
    const key = JSON.stringify(segments.map((s) => "param" in s ? null : s.literal));
    const existing = sources.get(key);
    if (existing) {
      throw new Error(`pages/${relative}: pages/${existing} と同じ URL に対応しています`);
    }
    sources.set(key, relative);
    pages.push({ ...page, segments });
  }
  return pages;
}

/** scanPages の例外に加え、ルートのファイルの default export が関数でない場合も例外を投げる。 */
export async function loadRouter(): Promise<
  (pathname: string, method: string) => RouteMatch | undefined
> {
  const statics = new Map<string, Route>();
  const dynamics: DynamicRoute[] = [];
  for (const page of await scanPages()) {
    const route = await loadRoute(page);
    if (page.segments.some((s) => "param" in s)) {
      dynamics.push({ segments: page.segments, route });
    } else {
      // リクエストの区切りをデコードした配列と同じ形のキーで引く
      statics.set(
        JSON.stringify(page.segments.flatMap((s) => "literal" in s ? [s.literal] : [])),
        route,
      );
    }
  }
  dynamics.sort((a, b) => compareSpecificity(a.segments, b.segments));

  const found = (route: Route, params: Record<string, string>, method: string): RouteMatch => ({
    handler: route.methods.get(method === "HEAD" ? "GET" : method),
    allow: route.allow,
    params,
  });
  return (pathname, method) => {
    const parts = splitPath(pathname);
    if (!parts) return undefined;
    const route = statics.get(JSON.stringify(parts));
    if (route) return found(route, {}, method);
    for (const { segments, route } of dynamics) {
      const params = matchSegments(segments, parts);
      if (params) return found(route, params, method);
    }
    return undefined;
  };
}

async function loadRoute({ url, relative, files }: PageDir): Promise<Route> {
  const load = async (name: string) => {
    const mod = await import(new URL(name, url).href);
    if (typeof mod.default !== "function") {
      throw new Error(`pages/${relative}${name}: default export にハンドラがありません`);
    }
    return mod.default;
  };
  const before: BeforeHandler | undefined = files.includes(BEFORE_FILE)
    ? await load(BEFORE_FILE)
    : undefined;
  const methods = new Map<string, PageHandler>();
  for (const name of files) {
    const method = METHOD_FILES[name];
    if (!method) continue;
    const handler: PageHandler = await load(name);
    methods.set(
      method,
      before ? async (req, ctx) => (await before(req, ctx)) ?? await handler(req, ctx) : handler,
    );
  }
  const allow = [...methods.keys()].flatMap((m) => m === "GET" ? ["GET", "HEAD"] : [m]);
  return { methods, allow };
}

function parseSegments(relative: string): Segment[] {
  const names = relative.split("/").slice(0, -1);
  const seen = new Set<string>();
  return names.map((name) => {
    if (!/[[\]]/.test(name)) return { literal: name };
    const param = name.match(/^\[(\w+)\]$/)?.[1];
    if (!param) throw new Error(`pages/${relative}: "${name}" はパスの名前に使えません`);
    if (seen.has(param)) {
      throw new Error(`pages/${relative}: パラメータ "${param}" が重複しています`);
    }
    seen.add(param);
    return { param };
  });
}

/** 不正なパーセントエンコーディングや、デコード後に制御文字を含む場合は undefined を返す。 */
function splitPath(pathname: string): string[] | undefined {
  if (pathname === "/") return [];
  let parts: string[];
  try {
    parts = pathname.slice(1).split("/").map(decodeURIComponent);
  } catch {
    return undefined;
  }
  return parts.some((part) => /\p{Cc}/u.test(part)) ? undefined : parts;
}

function matchSegments(segments: Segment[], parts: string[]): Record<string, string> | undefined {
  if (segments.length !== parts.length) return undefined;
  const params: Record<string, string> = {};
  for (const [i, segment] of segments.entries()) {
    if ("param" in segment) {
      if (parts[i] === "") return undefined;
      params[segment.param] = parts[i];
    } else if (segment.literal !== parts[i]) {
      return undefined;
    }
  }
  return params;
}

function compareSpecificity(a: Segment[], b: Segment[]): number {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const diff = Number("param" in a[i]) - Number("param" in b[i]);
    if (diff !== 0) return diff;
  }
  return 0;
}

/** ルートのファイルが 1 つでもあるディレクトリを返す。 */
async function* walk(
  dir: URL,
  relative: string,
): AsyncGenerator<{ url: URL; relative: string; files: string[] }> {
  const files: string[] = [];
  for await (const entry of Deno.readDir(dir)) {
    if (entry.isDirectory && !/^[_.]/.test(entry.name)) {
      yield* walk(new URL(`${encodeURIComponent(entry.name)}/`, dir), `${relative}${entry.name}/`);
    } else if (entry.isFile && (entry.name in METHOD_FILES || entry.name === BEFORE_FILE)) {
      files.push(entry.name);
    }
  }
  if (files.length > 0) yield { url: dir, relative, files: files.sort() };
}
