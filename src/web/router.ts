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
 * layout.ts・layout.tree.ts は、html-document.tsx の htmlDocument() がページの HTML を包むのに使う。
 * 適用する範囲と順番は before.ts・before.tree.ts と同じで、layout.ts だけがあるディレクトリも例外になる。
 *
 * これらのファイルの拡張子は .ts か .tsx（JSX を書くとき）で、同じ名前で両方を置くと例外になる。
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
import type { RoutePath } from "../routes.gen.ts";
import type { Layout } from "./html-document.tsx";

export type RouteContext = {
  /**
   * 照合したルートのパターン（例："/user/[id]"）。before.tree.ts で、置いたディレクトリ自身を除くときなどに使う。
   * `/%61dmin` も `/admin` に照合されるため、生の pathname で判定してはいけない。
   */
  route: RoutePath;
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
  route: RoutePath;
  handler: RouteHandler | undefined;
  allow: string[];
  params: Record<string, string>;
};

export type Segment = { literal: string } | { param: string };
/**
 * relative は src/routes/ からのディレクトリの相対パス（例："foo/"、ルートは ""）。
 * methods はメソッドのファイル名。befores・layouts は、適用する before・layout のファイルの src/routes/ からの
 * 相対パスを、外側（src/routes/ に近いもの）から順に並べたもの。
 */
export type RouteDir = {
  relative: string;
  segments: Segment[];
  methods: string[];
  befores: string[];
  layouts: string[];
};
type Route = { pattern: RoutePath; methods: Map<string, RouteHandler>; allow: string[] };
type DynamicRoute = { segments: Segment[]; route: Route };

const ROUTES_DIR = new URL("../routes/", import.meta.url);

// キーは拡張子を除いたファイル名
const METHOD_FILES: Record<string, string> = {
  get: "GET",
  post: "POST",
  put: "PUT",
  patch: "PATCH",
  delete: "DELETE",
};
const BEFORE_FILE = "before";
const TREE_BEFORE_FILE = "before.tree";
const LAYOUT_FILE = "layout";
const TREE_LAYOUT_FILE = "layout.tree";
const EXTENSIONS = [".ts", ".tsx"];

// キーはディレクトリのデコード済みの pathname。loadRouter で設定する
const layoutChains = new Map<string, Layout[]>();

/**
 * ディレクトリ名が不正な場合や、同じ URL に対応するページが複数ある場合、
 * before.ts・layout.ts があるのにメソッドのファイルがない場合、同じ名前の .ts と .tsx がある場合、
 * シンボリックリンクがある場合は例外を投げる。
 */
export async function scanRoutes(): Promise<RouteDir[]> {
  const routes: RouteDir[] = [];
  const sources = new Map<string, string>();
  for await (const dir of walk(ROUTES_DIR, "", { befores: [], layouts: [] })) {
    const { relative } = dir;
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

/**
 * scanRoutes の例外に加え、ルートのファイルの default export が関数でない場合や、
 * layout のファイルの default export が Layout の形でない場合も例外を投げる。
 */
export async function loadRouter(): Promise<
  (pathname: string, method: string) => RouteMatch | undefined
> {
  const statics = new Map<string, Route>();
  const dynamics: DynamicRoute[] = [];
  layoutChains.clear();
  for (const dir of await scanRoutes()) {
    const route = await loadRoute(dir);
    layoutChains.set(decodeURIComponent(urlOf(dir.relative).pathname), await loadLayouts(dir));
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
    route: route.pattern,
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

/**
 * moduleUrl のディレクトリに適用する layout を、外側から順に返す。moduleUrl には呼び出し側の import.meta.url を渡す。
 * ルートのディレクトリでない場合や、loadRouter の前に呼んだ場合は例外を投げる。
 */
export function layoutsOf(moduleUrl: string): Layout[] {
  const layouts = layoutChains.get(decodeURIComponent(new URL(".", moduleUrl).pathname));
  if (!layouts) throw new Error(`${moduleUrl} はルートのディレクトリにありません`);
  return layouts;
}

function urlOf(relative: string): URL {
  return new URL(relative.split("/").map(encodeURIComponent).join("/"), ROUTES_DIR);
}

async function loadLayouts(dir: RouteDir): Promise<Layout[]> {
  const layouts: Layout[] = [];
  for (const relative of dir.layouts) {
    const layout = (await import(urlOf(relative).href)).default;
    const title = layout?.title;
    if (
      typeof layout?.render !== "function" ||
      !(title === undefined || typeof title === "string" || typeof title === "function")
    ) {
      throw new Error(`routes/${relative}: default export が Layout の形になっていません`);
    }
    layouts.push(layout);
  }
  return layouts;
}

async function loadRoute(dir: RouteDir): Promise<Route> {
  const load = async (relative: string) => {
    const mod = await import(urlOf(relative).href);
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
      METHOD_FILES[name.slice(0, name.lastIndexOf("."))],
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
  // routes.gen.ts は scanRoutes の結果から patternOf で生成するため、生成し直していればこの値は RoutePath に含まれる
  return { pattern: patternOf(dir.segments) as RoutePath, methods, allow };
}

/** ルートのパターン（例："/user/[id]"）を返す。routes.gen.ts の RoutePath の各値になる。 */
export function patternOf(segments: Segment[]): string {
  return "/" + segments.map((s) => "param" in s ? `[${s.param}]` : s.literal).join("/");
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
 * メソッドのファイルがあるディレクトリを返す。
 * inherited は、上のディレクトリにある before.tree.ts・layout.tree.ts の相対パスを routes/ に近い順に並べたもの。
 */
async function* walk(
  dir: URL,
  relative: string,
  inherited: { befores: string[]; layouts: string[] },
): AsyncGenerator<{ relative: string; methods: string[]; befores: string[]; layouts: string[] }> {
  const files: string[] = [];
  const subdirs: string[] = [];
  for await (const entry of Deno.readDir(dir)) {
    // readDir はリンクを isFile・isDirectory のどちらにもしないため、before.tree.ts などがリンクだと
    // 黙って無視され、アクセス制御が外れる
    if (entry.isSymlink) {
      throw new Error(`routes/${relative}${entry.name}: シンボリックリンクは置けません`);
    }
    if (entry.isDirectory && !/^[_.]/.test(entry.name)) subdirs.push(entry.name);
    else if (entry.isFile) files.push(entry.name);
  }
  const find = (base: string): string | undefined => {
    const found = EXTENSIONS.map((ext) => base + ext).filter((name) => files.includes(name));
    if (found.length > 1) {
      throw new Error(`routes/${relative}${base}: ${found.join(" と ")} の両方があります`);
    }
    return found[0];
  };
  const append = (chain: string[], base: string) => {
    const name = find(base);
    return name ? [...chain, relative + name] : chain;
  };
  const tree = {
    befores: append(inherited.befores, TREE_BEFORE_FILE),
    layouts: append(inherited.layouts, TREE_LAYOUT_FILE),
  };
  const methods = Object.keys(METHOD_FILES).flatMap((base) => find(base) ?? []).sort();
  if (methods.length > 0) {
    yield {
      relative,
      methods,
      befores: append(tree.befores, BEFORE_FILE),
      layouts: append(tree.layouts, LAYOUT_FILE),
    };
  } else {
    const orphan = [BEFORE_FILE, LAYOUT_FILE].map(find).find(Boolean);
    if (orphan) {
      throw new Error(
        `routes/${relative}${orphan}: 同じディレクトリにメソッドのファイルがありません`,
      );
    }
  }
  for (const name of subdirs) {
    yield* walk(new URL(`${encodeURIComponent(name)}/`, dir), `${relative}${name}/`, tree);
  }
}
