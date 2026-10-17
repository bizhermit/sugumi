/**
 * src/routes/ のディレクトリを URL に対応させる。ディレクトリにあるメソッドのファイルが、そのメソッドのリクエストを処理する。
 *
 *   src/routes/get.ts             → GET /
 *   src/routes/foo/get.ts         → GET /foo
 *   src/routes/foo/post.ts        → POST /foo
 *   src/routes/user/[id]/get.ts   → GET /user/123（ctx.params.id は "123"）
 *
 * メソッドのファイルは get.ts・post.ts・put.ts・patch.ts・delete.ts で、default export でハンドラを公開する。
 * HEAD は get.ts で処理する。ファイルのないメソッドには、ハンドラを呼ばずに 405 を返す。
 * before.ts があれば、その default export をメソッドのハンドラより前に呼ぶ。Response を返すとそれを応答にし、
 * メソッドのハンドラは呼ばない。before.ts だけがあるディレクトリはルートにならず、例外になる。
 * before.tree.ts は before.ts と同じ形で、置いたディレクトリとその配下のすべてのルートに適用する。
 * ルートでないディレクトリにも置ける。routes/ に近いものから順に呼び、最後に before.ts を呼ぶ。
 * 405 を返すときは、どの before も呼ばない。
 *
 * これら以外のファイルはルートにしないため、ページ専用の部品は同じディレクトリに置ける。
 * `_` や `.` で始まるディレクトリは走査しない。ページの JS・CSS は `_assets/` に置く（assets.ts を参照）。
 * `/assets/` は静的ファイルの配信に使うため、`routes/assets/` は作れない。
 *
 * 静的なルートを動的なルートより優先し、動的なルート同士では前の区切りが固定のものを優先する。
 * パラメータの値はデコード済みで、形式の検証は各ページで行う。`%2F` は区切りにせず値の一部として渡す。
 *
 * `../` で routes 外に届かないよう、リクエストの内容をファイルパスや import の指定子に使わないこと。
 * `/%61dmin` も `/admin` と同じページに照合されるため、アクセス制御は生の pathname ではなく照合結果で判定すること。
 */
import type { Session } from "../lib/auth/session.ts";

export type RouteContext = {
  params: Record<string, string>;
  /** ログインしていなければ undefined。 */
  session: Session | undefined;
  /** フォームに埋め込む CSRF トークン。 */
  csrfToken: () => Promise<string>;
  /** 接続元の IP アドレス。リバースプロキシの裏ではプロキシのアドレスになる。 */
  remoteAddress: string | undefined;
};
export type RouteHandler = (req: Request, ctx: RouteContext) => Response | Promise<Response>;
/** Response を返すとそれを応答にする。undefined を返すとメソッドのハンドラに進む。 */
export type BeforeHandler = (
  req: Request,
  ctx: RouteContext,
) => Response | undefined | Promise<Response | undefined>;
/** handler は、メソッドのファイルがなければ undefined。allow は 405 の Allow ヘッダーに使う。 */
export type RouteMatch = {
  handler: RouteHandler | undefined;
  allow: string[];
  params: Record<string, string>;
};

export type Segment = { literal: string } | { param: string };
/**
 * relative は src/routes/ からのディレクトリの相対パス（例："foo/"、ルートは ""）。
 * methods はメソッドのファイル名。befores は呼ぶ順に並べた before のファイルの、src/routes/ からの相対パス。
 */
export type RouteDir = {
  relative: string;
  segments: Segment[];
  methods: string[];
  befores: string[];
};
type Route = { methods: Map<string, RouteHandler>; allow: string[] };
type DynamicRoute = { segments: Segment[]; route: Route };

const ROUTES_DIR = new URL("../routes/", import.meta.url);

const METHOD_FILES: Record<string, string> = {
  "get.ts": "GET",
  "post.ts": "POST",
  "put.ts": "PUT",
  "patch.ts": "PATCH",
  "delete.ts": "DELETE",
};
const BEFORE_FILE = "before.ts";
const TREE_BEFORE_FILE = "before.tree.ts";

/** ディレクトリ名が不正な場合や、同じ URL に対応するページが複数ある場合は例外を投げる。 */
export async function scanRoutes(): Promise<RouteDir[]> {
  const routes: RouteDir[] = [];
  const sources = new Map<string, string>();
  for await (const dir of walk(ROUTES_DIR, "", [])) {
    const { relative } = dir;
    if (dir.methods.length === 0) {
      throw new Error(
        `routes/${relative}${BEFORE_FILE}: 同じディレクトリにメソッドのファイルがありません`,
      );
    }
    const segments = parseSegments(relative);
    // /assets/ は assets.ts が静的ファイルの配信に使う
    if (segments[0] && "literal" in segments[0] && segments[0].literal === "assets") {
      throw new Error(`routes/${relative}: assets はページの URL に使えません`);
    }
    const key = JSON.stringify(segments.map((s) => "param" in s ? null : s.literal));
    const existing = sources.get(key);
    if (existing) {
      throw new Error(`routes/${relative}: routes/${existing} と同じ URL に対応しています`);
    }
    sources.set(key, relative);
    routes.push({ ...dir, segments });
  }
  return routes;
}

/** scanRoutes の例外に加え、ルートのファイルの default export が関数でない場合も例外を投げる。 */
export async function loadRouter(): Promise<
  (pathname: string, method: string) => RouteMatch | undefined
> {
  const statics = new Map<string, Route>();
  const dynamics: DynamicRoute[] = [];
  for (const dir of await scanRoutes()) {
    const route = await loadRoute(dir);
    if (dir.segments.some((s) => "param" in s)) {
      dynamics.push({ segments: dir.segments, route });
    } else {
      // リクエストの区切りをデコードした配列と同じ形のキーで引く
      statics.set(
        JSON.stringify(dir.segments.flatMap((s) => "literal" in s ? [s.literal] : [])),
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

async function loadRoute(dir: RouteDir): Promise<Route> {
  const load = async (relative: string) => {
    const mod = await import(
      new URL(relative.split("/").map(encodeURIComponent).join("/"), ROUTES_DIR).href
    );
    if (typeof mod.default !== "function") {
      throw new Error(`routes/${relative}: default export にハンドラがありません`);
    }
    return mod.default;
  };
  const befores: BeforeHandler[] = [];
  for (const relative of dir.befores) befores.push(await load(relative));
  const methods = new Map<string, RouteHandler>();
  for (const name of dir.methods) {
    const handler: RouteHandler = await load(dir.relative + name);
    methods.set(
      METHOD_FILES[name],
      befores.length === 0 ? handler : async (req, ctx) => {
        for (const before of befores) {
          const res = await before(req, ctx);
          if (res) return res;
        }
        return await handler(req, ctx);
      },
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
    if (!param) throw new Error(`routes/${relative}: "${name}" はパスの名前に使えません`);
    if (seen.has(param)) {
      throw new Error(`routes/${relative}: パラメータ "${param}" が重複しています`);
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

/**
 * メソッドのファイルか before.ts があるディレクトリを返す。
 * treeBefores は、上のディレクトリにある before.tree.ts の相対パスを routes/ に近い順に並べたもの。
 */
async function* walk(
  dir: URL,
  relative: string,
  treeBefores: string[],
): AsyncGenerator<{ relative: string; methods: string[]; befores: string[] }> {
  const files: string[] = [];
  const subdirs: string[] = [];
  for await (const entry of Deno.readDir(dir)) {
    if (entry.isDirectory && !/^[_.]/.test(entry.name)) subdirs.push(entry.name);
    else if (entry.isFile) files.push(entry.name);
  }
  const befores = files.includes(TREE_BEFORE_FILE)
    ? [...treeBefores, relative + TREE_BEFORE_FILE]
    : treeBefores;
  const methods = files.filter((name) => Object.hasOwn(METHOD_FILES, name)).sort();
  if (methods.length > 0 || files.includes(BEFORE_FILE)) {
    yield {
      relative,
      methods,
      befores: files.includes(BEFORE_FILE) ? [...befores, relative + BEFORE_FILE] : befores,
    };
  }
  for (const name of subdirs) {
    yield* walk(new URL(`${encodeURIComponent(name)}/`, dir), `${relative}${name}/`, befores);
  }
}
