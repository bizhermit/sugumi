/**
 * リポジトリ直下の static/ のファイルを、同じパスの URL で配信する（static/robots.txt → /robots.txt）。
 * favicon.ico や robots.txt のように、URL が外部の取り決めで決まるファイルに使う。
 * ページから読み込むファイルは、URL にハッシュを付けられる `_assets/` に置く（assets.ts を参照）。
 *
 * 置いたファイルは、ログインなしで誰でも取得できる。
 * ファイルは起動時にすべて読み込み、リクエストはその表で引くだけにする。
 * リクエストのパスからファイルパスを組み立てないため、`../` などで static/ 外のファイルには届かない。
 * 起動後に変更した内容は、再起動するまで反映されない。
 */
import { methodNotAllowed } from "./error-page.tsx";

// deno.json の permissions と Dockerfile で、static/ の読み取りを許可している
const STATIC_DIR = new URL("../../static/", import.meta.url);

// HTML・SVG・XML はこのオリジンでスクリプトを実行できる文書になるため、配信できる種類に含めない
const CONTENT_TYPES: Record<string, string> = {
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json",
};

// `.` で始まるもののうち、配信するもの。それ以外は .DS_Store などを誤って公開しないよう読み込まない
const DOT_NAMES = new Set([".well-known"]);

type StaticFile = { body: Uint8Array<ArrayBuffer>; contentType: string; etag: string };

// キーはリクエストの pathname と同じく、区切りごとにエンコードしたもの
const files = await loadFiles();

/** 配信するファイルの pathname の一覧。ルートとの重複を確かめるのに使う。 */
export function staticPaths(): string[] {
  return [...files.keys()];
}

/** pathname が static/ のファイルに当たれば応答を返し、当たらなければ undefined を返す。 */
export function serveStatic(req: Request, url: URL): Response | undefined {
  const found = files.get(url.pathname);
  if (!found) return undefined;
  if (req.method !== "GET" && req.method !== "HEAD") return methodNotAllowed(["GET", "HEAD"]);
  // URL にハッシュを付けられないため、内容を変えたときに古いものを使わせないよう毎回 ETag で確かめさせる
  const headers = new Headers({
    "content-type": found.contentType,
    etag: found.etag,
    "cache-control": "no-cache",
  });
  if (req.headers.get("if-none-match") === found.etag) {
    return new Response(null, { status: 304, headers });
  }
  return new Response(req.method === "HEAD" ? null : found.body, { headers });
}

/** 配信できない種類のファイルやシンボリックリンクがあれば例外を投げる。 */
async function loadFiles(): Promise<Map<string, StaticFile>> {
  const files = new Map<string, StaticFile>();
  try {
    await Deno.stat(STATIC_DIR);
  } catch (e) {
    if (e instanceof Deno.errors.NotFound) throw new Error("static/ がありません");
    throw e;
  }
  for await (const names of walk(STATIC_DIR, [])) {
    const name = names.at(-1)!;
    const dot = name.lastIndexOf(".");
    const contentType = dot > 0 ? CONTENT_TYPES[name.slice(dot)] : undefined;
    if (!contentType) {
      throw new Error(`static/${names.join("/")}: この種類のファイルは配信できません`);
    }
    const encoded = names.map(encodeURIComponent).join("/");
    const body = await Deno.readFile(new URL(encoded, STATIC_DIR));
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", body));
    const hash = Array.from(digest.slice(0, 8), (b) => b.toString(16).padStart(2, "0")).join("");
    files.set("/" + encoded, {
      body,
      contentType,
      etag: `"${hash}"`,
    });
  }
  return files;
}

async function* walk(dir: URL, names: string[]): AsyncGenerator<string[]> {
  for await (const entry of Deno.readDir(dir)) {
    if (entry.name.startsWith(".") && !DOT_NAMES.has(entry.name)) continue;
    const path = [...names, entry.name];
    if (entry.isSymlink) {
      throw new Error(`static/${path.join("/")}: シンボリックリンクは置けません`);
    }
    if (entry.isDirectory) {
      yield* walk(new URL(`${encodeURIComponent(entry.name)}/`, dir), path);
    } else if (entry.isFile) {
      yield path;
    }
  }
}
