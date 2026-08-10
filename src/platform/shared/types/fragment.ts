/**
 * region 側の型（`RegionName`）と断片側の型（`FragmentSource` / `ApplyMode`）の正本（規約 §0.5 / §4.5）。
 * サーバーもクライアントも同じ union を参照する（§4.3）。
 */

/**
 * region に付けた kebab-case の安定した識別子（§0.5）。
 * region ルート要素の `id` と `data-region` は本 union の値と同一文字列にする。
 */
export type RegionName = "main";

/**
 * 断片の適用モード。サーバーが `X-Partial-Mode` で返す値も本型に一致すること（§4.5）。
 * 初期スコープは2値に限定する（挿入系モードは未実測の経路でしか実装できないため。§4.5）。
 */
export type ApplyMode =
  /** 層2: target.setHTMLUnsafe(html) */
  | "replace-children"
  /** 層2: parseHTMLUnsafe(html) からノードを取り出し target.replaceWith(node) */
  | "replace-self";

/**
 * 断片の入力（§4.5）。
 *
 * TODO(フェーズ3・層3): §4.5 の正本は
 * `{ kind: "stream"; stream: ReadableStream<Uint8Array> }` を含む2 variant である。
 * ただし `ReadableStream` は `lib: ["es2025"]` / `types: []` の `shared` では解決できず
 * （TS2304。2026-08-10 実測）、§10.4 の「shared に dom / node 型を入れない」と直接衝突する。
 * フェーズ1では層3（ストリーミング）の実装が存在しないため `kind: "html"` のみで開始し、
 * 恒久対応（§4.5 と §10.3 / §10.4 のどちらを改訂するか）は規約側で決める。
 */
export type FragmentSource = { readonly kind: "html"; readonly html: string };
