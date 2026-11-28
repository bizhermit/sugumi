import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { extname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const ASSETS_PREFIX = "/_assets/";

export type Assets = {
  readonly styles?: readonly string[];
  readonly scripts?: readonly string[];
};

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

type Asset = {
  readonly body: Buffer;
  readonly contentType: string;
  readonly hash: string;
};

export type AssetCache = {
  readonly maxAge: number;
  readonly immutable?: boolean;
};

export type AssetOptions = {
  readonly cache?: AssetCache;
};

const DEFAULT_CACHE = {
  maxAge: 60 * 60 * 24 * 90,
  immutable: true,
} as const satisfies AssetCache;

const PUBLIC_DIR = fileURLToPath(new URL("../../public/", import.meta.url));
const SRC_DIR = fileURLToPath(new URL("../", import.meta.url));
const CLIENT_DIRECTORY = /(^|\/)_client\//;

function loadAssets(dir: string): Map<string, Asset> {
  let entries;
  try {
    entries = readdirSync(dir, { recursive: true, withFileTypes: true });
  } catch (err) {
    throw new Error("アセット（dist/public/）が存在しません。", { cause: err });
  }

  const result = new Map<string, Asset>();
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const path = join(entry.parentPath, entry.name);
    const name = relative(dir, path).split(sep).join("/");
    const contentType = CONTENT_TYPES[extname(entry.name)];
    if (contentType == null) {
      throw new Error(`配信できないアセットです: ${name}`);
    }
    const body = readFileSync(path);
    const hash = createHash("sha256").update(body).digest("hex").slice(0, 16);
    result.set(name, { body, contentType, hash });
  }
  return result;
}

const assets = loadAssets(PUBLIC_DIR);
const caches = new Map<string, AssetCache>();

function assetUrl(name: string, found: Asset): string {
  return `${ASSETS_PREFIX}${name}?v=${found.hash}`;
}

export function listAssets(): { readonly name: string; readonly body: Buffer; readonly url: string }[] {
  return [...assets].map(([name, found]) => ({ name, body: found.body, url: assetUrl(name, found) }));
}

function cacheControl(cache: AssetCache): string {
  if (cache.maxAge <= 0) {
    return "no-cache";
  }
  return `public, max-age=${cache.maxAge}${cache.immutable ? ", immutable" : ""}`;
}

export function serveAsset(req: Request, url: URL): Response {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return new Response("Method Not Allowed", { status: 405, headers: { allow: "GET, HEAD" } });
  }
  const name = url.pathname.slice(ASSETS_PREFIX.length);
  const found = assets.get(name);
  if (found == null) {
    return new Response("Not Found", { status: 404 });
  }

  const headers = new Headers({ "content-type": found.contentType, etag: `"${found.hash}"` });
  // asset()のURLは内容が変わるとvの値も変わるため、キャッシュを破棄させる必要はない。
  headers.set(
    "cache-control",
    url.searchParams.get("v") === found.hash ? cacheControl(caches.get(name) ?? DEFAULT_CACHE) : "no-cache",
  );
  if (req.headers.get("if-none-match") === `"${found.hash}"`) {
    return new Response(null, { status: 304, headers });
  }
  return new Response(req.method === "HEAD" ? null : found.body, { headers });
}

/**
 * ページから読み込むアセットのURLを返す。
 *
 * const style = asset(import.meta.resolve("./_client/style.css"));
 * const script = asset(import.meta.resolve("./_client/script.ts"));
 */
export function asset(file: string, options: AssetOptions = {}): string {
  const path = fileURLToPath(file);
  const source = relative(SRC_DIR, path).split(sep).join("/");
  if (!path.startsWith(SRC_DIR) || !CLIENT_DIRECTORY.test(source)) {
    throw new Error(`アセットのパスが不正です: ${file}`);
  }

  const name = source.replace(CLIENT_DIRECTORY, "$1").replace(/\.ts$/, ".js");
  const found = assets.get(name);
  if (found == null) {
    throw new Error(`アセットが存在しません: ${name}`);
  }

  if (options.cache != null) {
    const current = caches.get(name);
    if (current != null && (current.maxAge !== options.cache.maxAge || current.immutable !== options.cache.immutable)) {
      throw new Error(`${name} に異なる cache が指定されています`);
    }
    caches.set(name, options.cache);
  }
  return assetUrl(name, found);
}
