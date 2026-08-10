/**
 * サービス識別子と静的資産の名前空間の正本（規約 §15.2）。
 * 値の型だけを置き、server の型を1つも import しない（client からも参照しうるため shared にある）。
 */

/**
 * サービス名。ディレクトリ名（`src/services/<name>/`）と URL 名前空間（`/assets/services/<name>/`）に一致させる。
 * サービスを追加したら本 union に足す（§10.1 のサービス追加手順）。
 */
export type ServiceName = "app" | "admin";

/**
 * 配信してよい範囲と実行してよい範囲の共通の正本（§15.2）。
 * 宣言はエリア粒度であり、`server` レイヤーを表現する手段は持たない
 * （設定ミスでサーバー成果物が公開されることが構造的に起きない。§6.6）。
 */
export type AssetNamespace =
  | "platform"
  | `packages/${string}`
  | `services/${ServiceName}`;
