/**
 * src/ と scripts/ の import が、サーバー・クライアント・共有の取り決めに沿っているかを確かめる。
 * 違反があれば一覧を出して終了コード 1 で終わる。
 *
 *   `_assets/` の中（クライアント）：同じ `_assets/` の中と `_shared/` だけを import できる
 *   `_shared/` の中（共有）        ：`_shared/` だけを import できる
 *   それ以外（サーバー）            ：`_assets/` を import できない
 *
 * また、`*.mock.*` は `*.mock.*` からだけ import できる。モックは本番のイメージに含めない（.dockerignore）ため。
 *
 * あわせて、src/_shared/ とシンボリックリンクがないこと、`_assets/` と `_shared/` に JSX のファイルがないことを確かめる。
 * JSX は src/lib/jsx-runtime.ts を暗黙に import し、指定子がソースに現れないため、ファイルの拡張子で判定する。
 * ディレクトリをまたぐ共有の部品は src/lib/_shared/ に置く。
 * シンボリックリンクは、リンクの置き場所とリンク先で取り決めの判定が食い違うため使わない。
 *
 * import の指定子は正規表現で拾うため、文字列やコメントの中の `from "..."` も import として扱い、
 * `from` と指定子の間にコメントを挟んだものは見逃す。
 * 見逃しは deno task build のあとに check-bundle.ts が、実際にバンドルされたソースで検出する。
 */

type Kind = "client" | "shared" | "server";

const SPECIFIER = /(?:\bfrom|\bimport|\brequire)\s*\(?\s*(["'`])((?:(?!\1)[^\n])+)\1/g;
const DYNAMIC_IMPORT = /\bimport\s*\(\s*(?!["'`])/g;
const SOURCE_FILE = /\.[cm]?[jt]sx?$/;
const MOCK_FILE = /\.mock\.[^/]*$/;

if (import.meta.main) {
  const violations = await checkImports(new URL("../", import.meta.url));
  if (violations.length > 0) {
    console.error(violations.join("\n"));
    Deno.exit(1);
  }
}

/** root（リポジトリの直下）の src/ と scripts/ を確かめ、違反の一覧を返す。root はテストで別のディレクトリを渡す。 */
export async function checkImports(root: URL): Promise<Array<string>> {
  const violations: Array<string> = [];
  const rootPath = decodeURIComponent(root.pathname);
  const relative = (url: URL) => decodeURIComponent(url.pathname).slice(rootPath.length);
  if (await exists(new URL("src/_shared/", root))) {
    violations.push("src/_shared/: 作れません（src/lib/_shared/ に置いてください）");
  }
  for (const dir of ["src/", "scripts/"]) {
    for await (const file of walk(new URL(dir, root), relative, violations)) {
      violations.push(...await checkFile(file, relative));
    }
  }
  return violations;
}

async function checkFile(file: URL, relative: (url: URL) => string) {
  const violations: Array<string> = [];
  const from = relative(file);
  const fromKind = kindOf(from);
  if (fromKind !== "server" && /x$/.test(file.pathname)) {
    violations.push(`${from}: JSX はサーバー専用です`);
  }
  const text = await Deno.readTextFile(file);
  const lineOf = (index: number) => text.slice(0, index).split("\n").length;
  for (const { 2: specifier, index } of text.matchAll(SPECIFIER)) {
    const reason = check(from, fromKind, specifier, () => relative(new URL(specifier, file)));
    if (reason) {
      violations.push(`${from}:${lineOf(index)}: ${specifier} を import できません（${reason}）`);
    }
  }
  // 読み込む先を変数で決めると、どこを読み込むかを確かめられない
  if (fromKind !== "server") {
    for (const { index } of text.matchAll(DYNAMIC_IMPORT)) {
      violations.push(`${from}:${lineOf(index)}: import() には文字列を直接書いてください`);
    }
  }
  return violations;
}

/** 違反なら理由を、問題なければ undefined を返す。resolve は相対パスの指定子を、リポジトリの直下からのパスにする。 */
function check(
  from: string,
  fromKind: Kind,
  specifier: string,
  resolve: () => string,
): string | undefined {
  const isRelative = specifier.startsWith("./") || specifier.startsWith("../");
  if (!isRelative) {
    // node: などはサーバーの API で、ブラウザでは動かない
    return fromKind === "server"
      ? undefined
      : "_assets/ と _shared/ からは相対パスだけを import できます";
  }
  const to = resolve();
  if (MOCK_FILE.test(to) && !MOCK_FILE.test(from)) {
    return "*.mock.* は *.mock.* からだけ import できます";
  }
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

function kindOf(path: string) {
  const segments = path.split("/");
  if (segments.includes("_assets")) return "client";
  if (segments.includes("_shared")) return "shared";
  return "server";
}

function assetsRoot(path: string) {
  return path.slice(0, path.indexOf("/_assets/"));
}

async function exists(url: URL) {
  try {
    await Deno.stat(url);
    return true;
  } catch (e) {
    if (e instanceof Deno.errors.NotFound) return false;
    throw e;
  }
}

async function* walk(
  dir: URL,
  relative: (url: URL) => string,
  violations: Array<string>,
): AsyncGenerator<URL> {
  for await (const entry of Deno.readDir(dir)) {
    const url = new URL(encodeURIComponent(entry.name), dir);
    if (entry.isSymlink) {
      violations.push(`${relative(url)}: シンボリックリンクは使えません`);
    } else if (entry.isDirectory) {
      yield* walk(new URL(`${encodeURIComponent(entry.name)}/`, dir), relative, violations);
    } else if (entry.isFile && SOURCE_FILE.test(entry.name)) {
      yield url;
    }
  }
}
