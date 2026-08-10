/**
 * リポジトリ直下の URL を返す（規約 §6.5 / §3.4。2026-08-10 利用者裁定）。
 *
 * **引数に渡してよいのは合成ルート（`src/hosts/<name>/main.ts` ＝ `dist/hosts/<name>/main.js`）の
 * `import.meta.url` だけ**である。両者がともにリポジトリ直下から3階層下という不変条件
 * （§2.1 のツリーが保証する）のうえでのみ `"../../../"` が成立する。
 *
 * - `process.cwd()` を使わない（起動のしかたで値が変わり、起動時アサートの基準点が無言でずれる。§6.5）。
 * - 上方探索を使わない（permission model 下で probe が ERR_ACCESS_DENIED になる。§6.5）。
 * - §6.5 の起動時アサートと §3.4 の `db/schema.sql` 読み取りは**同じ解決方法を使う**。
 *   host で1度だけ算出し、値を配って使う（別々に実装すると基準点がずれる）。
 */
export function resolveRepoRoot(hostMainUrl: string | URL): URL {
  return new URL("../../../", hostMainUrl);
}
