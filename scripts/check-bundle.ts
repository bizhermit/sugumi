/**
 * dist/public/ のバンドルに、クライアント（`_assets/`）と共有（`_shared/`）以外のソースが入っていないかを確かめる。
 * 入っていれば一覧を出して終了コード 1 で終わる。deno task build がバンドルのあとに実行する。
 *
 * deno bundle はサーバー専用のコードを import してもエラーにせず、そのまま公開するファイルに含める。
 * check-imports.ts は import の書き方を見るだけで見逃しがあるため、実際にバンドルされたソースを
 * ソースマップの sources で確かめる。シンボリックリンクは解決された先のパスで記録される。
 */

const ROOT = new URL("../", import.meta.url);
const ROOT_PATH = decodeURIComponent(ROOT.pathname);
const PUBLIC_DIR = new URL("dist/public/", ROOT);

const violations: string[] = [];
let maps = 0;
for await (const file of walk(PUBLIC_DIR)) {
  if (!file.pathname.endsWith(".map")) continue;
  maps++;
  const { sources } = JSON.parse(await Deno.readTextFile(file)) as { sources: string[] };
  for (const source of sources) {
    const path = decodeURIComponent(new URL(source, file).pathname).slice(ROOT_PATH.length);
    const segments = path.split("/");
    const allowed = segments[0] === "src" &&
      (segments.includes("_assets") || segments.includes("_shared"));
    if (!allowed) violations.push(`${relative(file)}: ${path} がバンドルに含まれています`);
  }
}
// ソースマップがなければ何も確かめられないため、出力の設定が変わったことに気づけるようにする
if (maps === 0) violations.push("dist/public/ にソースマップがありません");
if (violations.length > 0) {
  console.error(violations.join("\n"));
  Deno.exit(1);
}

function relative(url: URL): string {
  return decodeURIComponent(url.pathname).slice(ROOT_PATH.length);
}

async function* walk(dir: URL): AsyncGenerator<URL> {
  for await (const entry of Deno.readDir(dir)) {
    if (entry.isDirectory) {
      yield* walk(new URL(`${encodeURIComponent(entry.name)}/`, dir));
    } else if (entry.isFile) {
      yield new URL(encodeURIComponent(entry.name), dir);
    }
  }
}
