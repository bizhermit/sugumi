/**
 * 合成ルートが組む依存の束（規約 §3.3）。ハンドラには引数で渡し、グローバル参照しない。
 *
 * **サービス固有の port をここに足してはならない**（§3.3）。
 * 足すと platform が特定サービスに縛られ、§2.2 の一方通行が崩れる。
 * サービス固有の依存は `<Service>Deps extends PlatformDeps` として各サービスが定義する。
 *
 * TODO(フェーズ2): §3.3 の正本は `config` / `sessions` / `users` / `now` / `randomBytes` / `log` の6つ。
 * 残る4つは `Config`（§6.5）・`SessionStore`・`UserRepository`（§3.2）・`Logger`（§8.4）の
 * 各型が生まれた時点で追加する。フェーズ1では追加ファイルを要さない2つだけを置く。
 */
export interface PlatformDeps {
  /** 時刻もポートにする（テストで固定するため。§3.3） */
  readonly now: () => Date;
  /**
   * 本番の合成ルートで配線してよいのは `node:crypto` の `randomBytes` だけ（§3.3）。
   * 既定実装・フォールバックを持たせない（テスト用の決定的実装が本番へ配線されても何も出ないため）。
   */
  readonly randomBytes: (n: number) => Uint8Array;
}
