/**
 * src/ と scripts/ の import が、サーバー・クライアント・共有の取り決めに沿っているかを確かめる。
 * 違反があれば一覧を出して終了コード 1 で終わる。
 *
 *   `_assets/` の中（クライアント）：同じ `_assets/` の中と `_shared/` だけを import できる
 *   `_shared/` の中（共有）        ：`_shared/` だけを import できる
 *   それ以外（サーバー）            ：`_assets/` を import できない
 *
 * あわせて、src/_shared/ がないことを確かめる。ディレクトリをまたぐ共有の部品は src/lib/_shared/ に置く。
 *
 * import の指定子は正規表現で拾うため、文字列やコメントの中の `from "..."` も import として扱う。
 */

type Kind = "client" | "shared" | "server";

const ROOT = new URL("../", import.meta.url);
const ROOT_PATH = decodeURIComponent(ROOT.pathname);
const SPECIFIER = /(?:\bfrom|\bimport)\s*\(?\s*["']([^"']+)["']/g;

const violations: string[] = [];
if (await exists(new URL("src/_shared/", ROOT))) {
  violations.push("src/_shared/: 作れません（src/lib/_shared/ に置いてください）");
}
for (const dir of ["src/", "scripts/"]) {
  for await (const file of walk(new URL(dir, ROOT))) {
    await checkFile(file);
  }
}
if (violations.length > 0) {
  console.error(violations.join("\n"));
  Deno.exit(1);
}

async function checkFile(file: URL): Promise<void> {
  const from = relative(file);
  const fromKind = kindOf(from);
  const lines = (await Deno.readTextFile(file)).split("\n");
  for (const [i, line] of lines.entries()) {
    for (const [, specifier] of line.matchAll(SPECIFIER)) {
      const reason = check(from, fromKind, specifier, file);
      if (reason) {
        violations.push(`${from}:${i + 1}: ${specifier} を import できません（${reason}）`);
      }
    }
  }
}

/** 違反なら理由を、問題なければ undefined を返す。 */
function check(from: string, fromKind: Kind, specifier: string, file: URL): string | undefined {
  const isRelative = specifier.startsWith("./") || specifier.startsWith("../");
  if (!isRelative) {
    // node: などはサーバーの API で、ブラウザでは動かない
    return fromKind === "server"
      ? undefined
      : "_assets/ と _shared/ からは相対パスだけを import できます";
  }
  const to = relative(new URL(specifier, file));
  const toKind = kindOf(to);
  switch (fromKind) {
    case "client":
      if (toKind === "shared") return undefined;
      if (toKind === "client" && assetsRoot(to) === assetsRoot(from)) return undefined;
      return "_assets/ からは、同じ _assets/ の中と _shared/ だけを import できます";
    case "shared":
      return toKind === "shared" ? undefined : "_shared/ からは _shared/ だけを import できます";
    case "server":
      return toKind === "client" ? "_assets/ はブラウザ専用です" : undefined;
  }
}

function kindOf(path: string): Kind {
  const segments = path.split("/");
  if (segments.includes("_assets")) return "client";
  if (segments.includes("_shared")) return "shared";
  return "server";
}

function assetsRoot(path: string): string {
  return path.slice(0, path.indexOf("/_assets/"));
}

function relative(url: URL): string {
  return decodeURIComponent(url.pathname).slice(ROOT_PATH.length);
}

async function exists(url: URL): Promise<boolean> {
  try {
    await Deno.stat(url);
    return true;
  } catch (e) {
    if (e instanceof Deno.errors.NotFound) return false;
    throw e;
  }
}

async function* walk(dir: URL): AsyncGenerator<URL> {
  for await (const entry of Deno.readDir(dir)) {
    if (entry.isDirectory) {
      yield* walk(new URL(`${encodeURIComponent(entry.name)}/`, dir));
    } else if (entry.isFile && entry.name.endsWith(".ts")) {
      yield new URL(encodeURIComponent(entry.name), dir);
    }
  }
}
