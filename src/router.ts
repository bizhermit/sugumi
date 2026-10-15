/**
 * src/pages/ のファイルを URL に対応させる。各ページは default export でハンドラを公開する。
 *
 *   src/pages/index.ts      → /
 *   src/pages/foo/index.ts  → /foo
 *   src/pages/foo/bar.ts    → /foo/bar
 *   src/pages/user/[id].ts  → /user/123（ctx.params.id は "123"）
 *
 * 静的なルートを動的なルートより優先し、動的なルート同士では前の区切りが固定のものを優先する。
 * パラメータの値はデコード済みで、形式の検証は各ページで行う。`%2F` は区切りにせず値の一部として渡す。
 *
 * `../` で pages 外に届かないよう、リクエストの内容をファイルパスや import の指定子に使わないこと。
 * `/%61dmin` も `/admin` と同じページに照合されるため、アクセス制御は生の pathname ではなく照合結果で判定すること。
 */
export type PageContext = { params: Record<string, string> };
export type PageHandler = (req: Request, ctx: PageContext) => Response | Promise<Response>;
export type RouteMatch = { handler: PageHandler; params: Record<string, string> };

type Segment = { literal: string } | { param: string };
type DynamicRoute = { segments: Segment[]; handler: PageHandler };

const PAGES_DIR = new URL("./pages/", import.meta.url);

/** ルートが重複・曖昧な場合や、ページの default export が関数でない場合は例外を投げる。 */
export async function loadRouter(): Promise<(pathname: string) => RouteMatch | undefined> {
  const statics = new Map<string, PageHandler>();
  const dynamics: DynamicRoute[] = [];
  const sources = new Map<string, string>();
  for await (const { url, relative } of walk(PAGES_DIR, "")) {
    const segments = parseSegments(relative);
    // 静的なルートはそのままリクエストの区切りと突き合わせるキーにもなる
    const key = JSON.stringify(segments.map((s) => "param" in s ? null : s.literal));
    const existing = sources.get(key);
    if (existing) throw new Error(`${relative}: ${existing} と同じ URL に対応しています`);
    sources.set(key, relative);

    const mod = await import(url.href);
    if (typeof mod.default !== "function") {
      throw new Error(`${relative}: default export にリクエストハンドラがありません`);
    }
    if (segments.some((s) => "param" in s)) {
      dynamics.push({ segments, handler: mod.default });
    } else {
      statics.set(key, mod.default);
    }
  }
  dynamics.sort((a, b) => compareSpecificity(a.segments, b.segments));

  return (pathname) => {
    const parts = splitPath(pathname);
    if (!parts) return undefined;
    const handler = statics.get(JSON.stringify(parts));
    if (handler) return { handler, params: {} };
    for (const route of dynamics) {
      const params = matchSegments(route.segments, parts);
      if (params) return { handler: route.handler, params };
    }
    return undefined;
  };
}

function parseSegments(relative: string): Segment[] {
  const names = relative.replace(/\.ts$/, "").split("/");
  if (names.at(-1) === "index") names.pop();
  const seen = new Set<string>();
  return names.map((name) => {
    if (!/[[\]]/.test(name)) return { literal: name };
    const param = name.match(/^\[(\w+)\]$/)?.[1];
    if (!param) throw new Error(`${relative}: "${name}" はパスの名前に使えません`);
    if (seen.has(param)) throw new Error(`${relative}: パラメータ "${param}" が重複しています`);
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

async function* walk(dir: URL, prefix: string): AsyncGenerator<{ url: URL; relative: string }> {
  for await (const entry of Deno.readDir(dir)) {
    if (entry.isDirectory) {
      yield* walk(new URL(`${encodeURIComponent(entry.name)}/`, dir), `${prefix}${entry.name}/`);
    } else if (entry.isFile && entry.name.endsWith(".ts")) {
      yield { url: new URL(encodeURIComponent(entry.name), dir), relative: prefix + entry.name };
    }
  }
}
