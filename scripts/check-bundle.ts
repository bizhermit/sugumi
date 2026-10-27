/**
 * dist/public/ のバンドルに、クライアント（`_assets/`）と共有（`_shared/`）以外のソースが入っていないかを確かめる。
 * 入っていれば、一覧を出して終了コード 1 で終わる。deno task build がバンドルのあとに実行する。
 *
 * deno bundle はサーバー専用のコードを import してもエラーにせず、そのまま公開するファイルに含める。
 * check-imports.ts は import の書き方しか見ないので、見逃すことがある。そこで、実際にバンドルされたソースを
 * ソースマップの sources で確かめる。シンボリックリンクは、リンク先のパスで記録される。
 */

if (import.meta.main) {
  const violations = await checkBundle(new URL("../", import.meta.url));
  if (violations.length > 0) {
    console.error(violations.join("\n"));
    Deno.exit(1);
  }
}

/** root（リポジトリのルート）の dist/public/ を確かめ、違反の一覧を返す。テストでは root に別のディレクトリを渡す。 */
export async function checkBundle(root: URL): Promise<Array<string>> {
  const rootPath = decodeURIComponent(root.pathname);
  const relative = (url: URL) => decodeURIComponent(url.pathname).slice(rootPath.length);
  const violations: Array<string> = [];
  let maps = 0;
  for await (const file of walk(new URL("dist/public/", root))) {
    if (!file.pathname.endsWith(".map")) continue;
    maps++;
    const { sources } = JSON.parse(await Deno.readTextFile(file)) as { sources: Array<string> };
    for (const source of sources) {
      const path = relative(new URL(source, file));
      const segments = path.split("/");
      const allowed = segments[0] === "src" &&
        (segments.includes("_assets") || segments.includes("_shared"));
      if (!allowed) violations.push(`${relative(file)}: ${path} がバンドルに含まれています`);
    }
  }
  // ソースマップがないと何も確かめられないので、出力の設定が変わったときに気づけるようにする。
  if (maps === 0) violations.push("dist/public/ にソースマップがありません");
  return violations;
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
