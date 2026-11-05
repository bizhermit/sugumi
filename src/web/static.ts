import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { extname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const STATIC_DIR = fileURLToPath(new URL("../../../static/", import.meta.url));

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json",
};

const VALID_NAME = /^[\w.-]+$/;

const DOT_NAMES = new Set([".well-known"]);

type StaticFile = {
  readonly body: Buffer;
  readonly contentType: string;
  readonly etag: string;
};

function loadFiles(dir: string): Map<string, StaticFile> {
  let entries;
  try {
    entries = readdirSync(dir, { recursive: true, withFileTypes: true });
  } catch (err) {
    throw new Error("static/ がありません。", { cause: err });
  }

  const result = new Map<string, StaticFile>();
  for (const entry of entries) {
    const path = join(entry.parentPath, entry.name);
    const names = relative(dir, path).split(sep);
    if (names.some((name) => name.startsWith(".") && !DOT_NAMES.has(name))) continue;
    const pathname = `/${names.join("/")}`;
    if (entry.isSymbolicLink()) {
      throw new Error(`static${pathname} はシンボリックリンクなので配信できません。`);
    }
    if (!entry.isFile()) continue;
    if (!names.every((name) => VALID_NAME.test(name))) {
      throw new Error(`static${pathname} は URL に使えない文字を含みます。`);
    }
    const contentType = CONTENT_TYPES[extname(entry.name)];
    if (contentType == null) {
      throw new Error(`static${pathname} は配信できない種類のファイルです。`);
    }
    const body = readFileSync(path);
    const hash = createHash("sha256").update(body).digest("hex").slice(0, 16);
    result.set(pathname, { body, contentType, etag: `"${hash}"` });
  }
  return result;
}

const files = loadFiles(STATIC_DIR);

export function staticPaths(): string[] {
  return [...files.keys()];
}

export function serveStatic(req: Request, url: URL): Response | undefined {
  const found = files.get(url.pathname);
  if (found == null) return undefined;
  if (req.method !== "GET" && req.method !== "HEAD") {
    return new Response("Method Not Allowed", { status: 405, headers: { allow: "GET, HEAD" } });
  }
  // URLにハッシュを付けられないため、内容を変えても古いものが残らないように毎回ETagで確かめる
  const headers = new Headers({ "content-type": found.contentType, etag: found.etag, "cache-control": "no-cache" });
  if (req.headers.get("if-none-match") === found.etag) {
    return new Response(null, { status: 304, headers });
  }
  return new Response(req.method === "HEAD" ? null : found.body, { headers });
}
