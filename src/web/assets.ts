/**
 * src/ の各 `_assets/` 直下にある index.ts・index.css を、deno task build で dist/public/ にバンドルする。
 * そのファイルを /assets/ で配信する。`_assets/` の中のそれ以外のファイルは、index から読み込まれる部品になる。
 *
 * deno bundle はエントリーに共通する親ディレクトリを基準に出力する。
 * src/web/_assets/ と src/routes/ にエントリーがあるため、dist/public/ は src/ と同じ構成になる。
 *
 * ファイルは起動時にすべて読み込み、リクエストはその表で引くだけにする。
 * リクエストのパスからファイルパスを組み立てないため、`../` などで dist/public/ 外のファイルには届かない。
 * 起動後にビルドし直した内容は、再起動するまで反映されない。
 */
import { errorPage, methodNotAllowed } from "./error-page.tsx";

// deno.json の permissions と Dockerfile で、dist/public/ の読み取りを許可している
const PUBLIC_DIR = new URL("../../dist/public/", import.meta.url);
const SRC_DIR = new URL("../", import.meta.url);

export const ASSETS_PREFIX = "/assets/";

const CONTENT_TYPES: Record<string, string> = {
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};

type Asset = { body: Uint8Array<ArrayBuffer>; contentType: string; hash: string };

const assets = await loadAssets();

type PageAssets = Readonly<{ style?: string; script?: string }>;
// ページを出すたびに呼ぶため、結果を moduleUrl ごとに覚えておく。moduleUrl は import.meta.url なので、ファイルの数より増えない
const pageAssets = new Map<string, PageAssets>();

/**
 * dist/public/ からの相対パス name のファイルを読み込む URL を返す。
 * name のファイルがなければ例外を投げる。
 *
 *   asset("routes/login/_assets/login.js") // "/assets/routes/login/_assets/login.js?v=..."
 */
export function asset(name: string): string {
  const found = assets.get(name);
  if (!found) throw new Error(`${name} は dist/public/ にありません`);
  return `${ASSETS_PREFIX}${name}?v=${found.hash}`;
}

/**
 * moduleUrl と同じディレクトリの `_assets/` の index.css と index.ts をバンドルしたものの URL を返す。
 * ないものは undefined になる。moduleUrl には呼び出し側の import.meta.url を渡す。
 */
export function assetsOf(moduleUrl: string): PageAssets {
  const cached = pageAssets.get(moduleUrl);
  if (cached) return cached;
  const dir = decodeURIComponent(new URL("_assets/", moduleUrl).pathname);
  const src = decodeURIComponent(SRC_DIR.pathname);
  if (!dir.startsWith(src)) throw new Error(`${moduleUrl} は src/ の外にあります`);
  const prefix = dir.slice(src.length);
  const urlOf = (name: string) => assets.has(prefix + name) ? asset(prefix + name) : undefined;
  const found = Object.freeze({ style: urlOf("index.css"), script: urlOf("index.js") });
  pageAssets.set(moduleUrl, found);
  return found;
}

/** pathname が ASSETS_PREFIX で始まるリクエストに応答する。 */
export function serveAsset(req: Request, url: URL): Response {
  const found = assets.get(url.pathname.slice(ASSETS_PREFIX.length));
  if (!found) return errorPage(404);
  if (req.method !== "GET" && req.method !== "HEAD") return methodNotAllowed(["GET", "HEAD"]);
  const headers = new Headers({ "content-type": found.contentType, etag: `"${found.hash}"` });
  // asset() の URL は内容が変わると v も変わるため、ずっとキャッシュさせてよい。
  // チャンクのように v を付けずに読み込まれるファイルは、毎回 ETag で確かめさせる。
  headers.set(
    "cache-control",
    url.searchParams.get("v") === found.hash ? "public, max-age=31536000, immutable" : "no-cache",
  );
  if (req.headers.get("if-none-match") === `"${found.hash}"`) {
    return new Response(null, { status: 304, headers });
  }
  return new Response(req.method === "HEAD" ? null : found.body, { headers });
}

async function loadAssets() {
  const assets = new Map<string, Asset>();
  try {
    await Deno.stat(PUBLIC_DIR);
  } catch (e) {
    if (e instanceof Deno.errors.NotFound) {
      throw new Error("dist/public/ がありません。deno task build を実行してください");
    }
    throw e;
  }
  for await (const relative of walk(PUBLIC_DIR, "")) {
    // ソースマップは check-bundle.ts の検査のために出力している。配信するとコメントを含むソースが公開される
    if (relative.endsWith(".map")) continue;
    const body = await Deno.readFile(new URL(relative, PUBLIC_DIR));
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", body));
    const hash = Array.from(digest.slice(0, 8), (b) => b.toString(16).padStart(2, "0")).join("");
    const ext = relative.slice(relative.lastIndexOf("."));
    assets.set(relative, {
      body,
      contentType: CONTENT_TYPES[ext] ?? "application/octet-stream",
      hash,
    });
  }
  return assets;
}

async function* walk(dir: URL, prefix: string): AsyncGenerator<string> {
  for await (const entry of Deno.readDir(dir)) {
    if (entry.isDirectory) {
      yield* walk(new URL(`${entry.name}/`, dir), `${prefix}${entry.name}/`);
    } else if (entry.isFile) {
      yield `${prefix}${entry.name}`;
    }
  }
}
