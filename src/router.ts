/**
 * src/pages/ のファイルを URL に対応させる。各ページは default export でハンドラを公開する。
 *
 *   src/pages/index.ts      → /
 *   src/pages/foo/index.ts  → /foo
 *   src/pages/foo/bar.ts    → /foo/bar
 *
 * `../` で pages 外に届かないよう、リクエストの内容をファイルパスや import の指定子に使わないこと。
 */
export type PageHandler = (req: Request) => Response | Promise<Response>;

const PAGES_DIR = new URL("./pages/", import.meta.url);

export async function loadRoutes(): Promise<Map<string, PageHandler>> {
  const routes = new Map<string, PageHandler>();
  for await (const file of walk(PAGES_DIR)) {
    const relative = file.href.slice(PAGES_DIR.href.length);
    const route = toRoute(relative);
    const mod = await import(file.href);
    if (typeof mod.default !== "function") {
      throw new Error(`${relative}: default export にリクエストハンドラがありません`);
    }
    routes.set(route, mod.default);
  }
  return routes;
}

function toRoute(relative: string): string {
  const segments = relative.replace(/\.ts$/, "").split("/");
  if (segments.at(-1) === "index") segments.pop();
  return "/" + segments.join("/");
}

async function* walk(dir: URL): AsyncGenerator<URL> {
  for await (const entry of Deno.readDir(dir)) {
    if (entry.isDirectory) {
      yield* walk(new URL(`${entry.name}/`, dir));
    } else if (entry.isFile && entry.name.endsWith(".ts")) {
      yield new URL(entry.name, dir);
    }
  }
}
