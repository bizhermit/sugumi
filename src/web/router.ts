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
 * get.mock.ts のように .mock を付けたファイルは、mock を指定したときに付けないファイルの代わりに使い、
 * 指定しないときは無視する。付けないファイルがなければ、mock の指定によらず例外になる。
 * mock の指定でルートの一覧が変わると、モードによらず生成する routes.gen.ts と食い違うため。
 *
 * これら以外のファイルはルートにしないため、ページ専用の部品は同じディレクトリに置ける。
 * `_` や `.` で始まるディレクトリは走査しない。ページの JS・CSS は `_assets/` に置く（assets.ts を参照）。
 * `/assets/` は静的ファイルの配信に使うため、`routes/assets/` は作れない。
 * static/ のファイルと同じ URL になるルートは、app.ts が起動時に例外にする。
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

/** 分割代入で取り出しても使える。値を書き足さず、before からの受け渡しには slot.ts の slot() を使う。 */
export type RouteContext = {
  /**
   * 照合したルートのパターン（例："/user/[id]"）。before.tree.ts で、置いたディレクトリ自身を除くときなどに使う。
   * `/%61dmin` も `/admin` に照合されるため、生の pathname で判定してはいけない。
   */
  readonly route: RoutePath;
  readonly params: Record<string, string>;
  /** ログインしていなければ undefined。 */
  readonly session: Session | undefined;
  /** URL のクエリ。new URL(req.url) で解析し直さずにこれを使う。 */
  readonly query: URLSearchParams;
  /**
   * フォームの本文。CSRF の検証で解析したものを返すため、本文を何度も解析しない。
   * フォームでないか解析できなければ、app.ts がページの代わりに 400 を返すため、ページで例外を受けなくてよい。
   */
  readonly form: () => Promise<FormData>;
  /** フォームに埋め込む CSRF トークン。何度呼んでも同じ値を返す。 */
  readonly csrfToken: () => Promise<string>;
  /**
   * 接続元の IP アドレス。同じアドレスは常に同じ文字列になる（src/lib/ip.ts の formatIp の表記）。分からなければ undefined。
   * リバースプロキシの裏では、環境変数 TRUSTED_PROXIES を設定しないとプロキシのアドレスになる。
   */
  readonly remoteAddress: string | undefined;
  /**
   * リクエストごとに振る ID。app.ts のアクセスログ・エラーログと、src/lib/audit.ts の監査ログに出し、突き合わせに使う。
   * ページが独自にログを出すときも、これを入れる。
   */
  readonly requestId: string;
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
  allow: Array<string>;
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
  segments: Array<Segment>;
  methods: Array<string>;
  befores: Array<string>;
  layouts: Array<string>;
};
type Route = { pattern: RoutePath; methods: Map<string, RouteHandler>; allow: Array<string> };
type DynamicRoute = { segments: Array<Segment>; route: Route };

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
const MOCK_SUFFIX = ".mock";
const SPECIAL_FILES = [
  ...Object.keys(METHOD_FILES),
  BEFORE_FILE,
  TREE_BEFORE_FILE,
  LAYOUT_FILE,
  TREE_LAYOUT_FILE,
].flatMap((name) => [name, name + MOCK_SUFFIX]);

// キーはディレクトリのデコード済みの pathname。loadRouter で設定する
const layoutChains = new Map<string, Array<Layout>>();
// ページを出すたびに layoutsOf() を呼ぶため、URL の解析をしないよう moduleUrl ごとに覚えておく。
// moduleUrl は import.meta.url なので、ファイルの数より増えない
const layoutsByModule = new Map<string, Array<Layout>>();

/**
 * ディレクトリ名が不正な場合や、同じ URL に対応するページが複数ある場合、
 * before.ts・layout.ts があるのにメソッドのファイルがない場合、同じ名前の .ts と .tsx がある場合、
 * メソッド・before・layout のファイルの名前の大文字小文字や拡張子が違う場合、
 * .mock を付けたファイルに付けないファイルがない場合、シンボリックリンクがある場合は例外を投げる。
 * mock が true なら、.mock を付けたファイルがあればそちらを返す。
 * root は走査するディレクトリで、既定は src/routes/。テストで別のディレクトリを走査するときに渡す。
 */
export async function scanRoutes(
  { mock = false, root = ROUTES_DIR }: { mock?: boolean; root?: URL } = {},
): Promise<Array<RouteDir>> {
  const routes: Array<RouteDir> = [];
  const sources = new Map<string, string>();
  for await (const dir of walk(root, "", { befores: [], layouts: [] }, mock)) {
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
 * mock が true なら、.mock を付けたファイルがあればそちらを読み込む。root は scanRoutes と同じ。
 */
export async function loadRouter(
  { mock, root = ROUTES_DIR }: { mock: boolean; root?: URL },
): Promise<(pathname: string, method: string) => RouteMatch | undefined> {
  const statics = new Map<string, Route>();
  // ルートの数に比例して照合が遅くならないよう、区切りの数ごとに分けて、同じ数のものだけを調べる
  const dynamics = new Map<number, Array<DynamicRoute>>();
  layoutChains.clear();
  layoutsByModule.clear();
  for (const dir of await scanRoutes({ mock, root })) {
    const route = await loadRoute(root, dir);
    layoutChains.set(
      decodeURIComponent(urlOf(root, dir.relative).pathname),
      await loadLayouts(root, dir),
    );
    if (dir.segments.some((s) => "param" in s)) {
      const sameLength = dynamics.get(dir.segments.length) ?? [];
      sameLength.push({ segments: dir.segments, route });
      dynamics.set(dir.segments.length, sameLength);
    } else {
      // リクエストの区切りから staticKey() で作るキーと同じ形で引く
      statics.set(staticKey(dir.segments.map((s) => "literal" in s ? s.literal : "")), route);
    }
  }
  for (const sameLength of dynamics.values()) {
    sameLength.sort((a, b) => compareSpecificity(a.segments, b.segments));
  }

  const found = (route: Route, params: Record<string, string>, method: string): RouteMatch => ({
    route: route.pattern,
    handler: route.methods.get(method === "HEAD" ? "GET" : method),
    allow: route.allow,
    params,
  });
  return (pathname, method) => {
    const parts = splitPath(pathname);
    if (!parts) return undefined;
    const route = statics.get(staticKey(parts));
    if (route) return found(route, {}, method);
    const sameLength = dynamics.get(parts.length);
    if (!sameLength) return undefined;
    for (const { segments, route } of sameLength) {
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
export function layoutsOf(moduleUrl: string): Array<Layout> {
  const cached = layoutsByModule.get(moduleUrl);
  if (cached) return cached;
  const layouts = layoutChains.get(decodeURIComponent(new URL(".", moduleUrl).pathname));
  if (!layouts) throw new Error(`${moduleUrl} はルートのディレクトリにありません`);
  layoutsByModule.set(moduleUrl, layouts);
  return layouts;
}

function urlOf(root: URL, relative: string) {
  return new URL(relative.split("/").map(encodeURIComponent).join("/"), root);
}

async function loadLayouts(root: URL, dir: RouteDir) {
  const layouts: Array<Layout> = [];
  for (const relative of dir.layouts) {
    const layout = (await import(urlOf(root, relative).href)).default;
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

async function loadRoute(root: URL, dir: RouteDir) {
  const load = async (relative: string) => {
    const mod = await import(urlOf(root, relative).href);
    if (typeof mod.default !== "function") {
      throw new Error(`routes/${relative}: default export にハンドラがありません`);
    }
    return mod.default;
  };
  const befores: Array<BeforeHandler> = [];
  for (const relative of dir.befores) befores.push(await load(relative));
  const methods = new Map<string, RouteHandler>();
  for (const name of dir.methods) {
    const handler: RouteHandler = await load(dir.relative + name);
    methods.set(
      METHOD_FILES[name.slice(0, name.indexOf("."))],
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
export function patternOf(segments: Array<Segment>): string {
  return "/" + segments.map((s) => "param" in s ? `[${s.param}]` : s.literal).join("/");
}

function parseSegments(relative: string): Array<Segment> {
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

/**
 * デコード済みの区切りを、静的なルートの表のキーにする。
 * 区切りは `%2F` をデコードした `/` を含みうるため、splitPath() が断る制御文字の \0 でつなぐ。
 */
function staticKey(parts: Array<string>) {
  return parts.join("\0");
}

const CONTROL_CHAR = /\p{Cc}/u;

/** 不正なパーセントエンコーディングや、デコード後に制御文字を含む場合は undefined を返す。 */
function splitPath(pathname: string) {
  if (pathname === "/") return [];
  const parts = pathname.slice(1).split("/");
  // リクエストのたびに通るため、コールバックを作らずにループで書く
  for (let i = 0; i < parts.length; i++) {
    let part: string;
    try {
      part = decodeURIComponent(parts[i]);
    } catch {
      return undefined;
    }
    if (CONTROL_CHAR.test(part)) return undefined;
    parts[i] = part;
  }
  return parts;
}

/** segments と parts の長さは同じであること。 */
function matchSegments(segments: Array<Segment>, parts: Array<string>) {
  const params: Record<string, string> = {};
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    if ("param" in segment) {
      if (parts[i] === "") return undefined;
      params[segment.param] = parts[i];
    } else if (segment.literal !== parts[i]) {
      return undefined;
    }
  }
  return params;
}

function compareSpecificity(a: Array<Segment>, b: Array<Segment>) {
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
  inherited: { befores: Array<string>; layouts: Array<string> },
  mock: boolean,
): AsyncGenerator<
  { relative: string; methods: Array<string>; befores: Array<string>; layouts: Array<string> }
> {
  const files: Array<string> = [];
  const subdirs: Array<string> = [];
  for await (const entry of Deno.readDir(dir)) {
    // readDir はリンクを isFile・isDirectory のどちらにもしないため、before.tree.ts などがリンクだと
    // 黙って無視され、アクセス制御が外れる
    if (entry.isSymlink) {
      throw new Error(`routes/${relative}${entry.name}: シンボリックリンクは置けません`);
    }
    if (entry.isDirectory && !/^[_.]/.test(entry.name)) subdirs.push(entry.name);
    else if (entry.isFile) {
      checkSpecialName(relative, entry.name);
      files.push(entry.name);
    }
  }
  const pick = (base: string): string | undefined => {
    const found = EXTENSIONS.map((ext) => base + ext).filter((name) => files.includes(name));
    if (found.length > 1) {
      throw new Error(`routes/${relative}${base}: ${found.join(" と ")} の両方があります`);
    }
    return found[0];
  };
  const find = (base: string): string | undefined => {
    const real = pick(base);
    const mocked = pick(base + MOCK_SUFFIX);
    if (mocked && !real) {
      throw new Error(
        `routes/${relative}${mocked}: 同じディレクトリに ${
          EXTENSIONS.map((ext) => base + ext).join("・")
        } がありません`,
      );
    }
    return mock && mocked ? mocked : real;
  };
  const append = (chain: Array<string>, base: string) => {
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
    yield* walk(new URL(`${encodeURIComponent(name)}/`, dir), `${relative}${name}/`, tree, mock);
  }
}

// before.jsx や Before.ts のような名前は黙って無視され、アクセス制御が外れる
function checkSpecialName(relative: string, name: string) {
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return;
  const [stem, ext] = [name.slice(0, dot), name.slice(dot)];
  if (!SPECIAL_FILES.includes(stem.toLowerCase())) return;
  if (SPECIAL_FILES.includes(stem) && EXTENSIONS.includes(ext)) return;
  throw new Error(
    `routes/${relative}${name}: 名前は小文字、拡張子は ${EXTENSIONS.join("・")} にしてください`,
  );
}
